/**
 * Classificador LLM - Detecta intenções e vendas
 */

export interface MessageClassification {
  intent: 'compra' | 'duvida' | 'reclamacao' | 'desistencia' | 'negociacao' | 'outro'
  funnel_stage: 'lead' | 'negociacao' | 'closed_won' | 'closed_lost'
  sentiment: number // 1-5
  needs_attention: boolean
  attention_reason?: string
  value_cents?: number
  confidence: number
}

type ProviderName = 'kimi' | 'deepseek' | 'glm5'

interface ProviderConfig {
  url: string
  apiKey: string
  model: string
}

const SYSTEM_PROMPT = `Você é um classificador de mensagens de WhatsApp de vendas. Seja CONSERVADOR e PRECISO.

Analise a mensagem e retorne APENAS um JSON válido com:
{
  "intent": "compra" | "duvida" | "reclamacao" | "desistencia" | "negociacao" | "outro",
  "funnel_stage": "lead" | "negociacao" | "closed_won" | "closed_lost",
  "sentiment": 1-5 (1=muito negativo, 5=muito positivo),
  "needs_attention": true/false,
  "attention_reason": "motivo se needs_attention=true",
  "value_cents": valor_em_centavos_se_mencionado_ou_null,
  "confidence": 0.0-1.0
}

REGRA CRÍTICA: Só classifique "closed_won" ou "closed_lost" se houver CERTEZA ABSOLUTA.

### closed_won (APENAS se):
- "Vou pagar agora", "Já fiz o PIX", "Pode mandar a fatura", "Fechado, valor X"
- "Comprovante anexado", "Paguei o pacote de R$ X"
- Confirmação EXPLÍCITA de pagamento/fechamento com valor

### NÃO é closed_won:
- "Ok", "Sim", "Combinado", "Beleza", "Perfeito", "Agora sim"
- "Fica combinado", "Está bem", "Vou chamar", "Vou ver"
- Mensagens vagas ou simples confirmações de conversa

### closed_lost (APENAS se):
- "Desisti", "Não quero mais", "Vou com a concorrência"
- "Muito caro, vou desistir" (com desistência explícita)

### negociacao:
- Interesse em comprar mas sem fechamento
- Perguntas sobre preço, condições, formas de pagamento
- "Quanto custa?", "Tem desconto?", "Quero saber mais"

### lead:
- Primeiro contato, dúvidas gerais
- Mensagens que não se encaixam nas outras categorias

### confidence:
- 0.9+ = Certeza absoluta (fechamento confirmado com valor)
- 0.7-0.9 = Alta confiança
- 0.5-0.7 = Moderada
- <0.5 = Incerto (use "outro" ou "lead")

Extraia valor em centavos se mencionado (ex: "R$ 500" → 50000).`

function getProviderConfigs(): Record<ProviderName, ProviderConfig> {
  return {
    kimi: {
      url: 'https://integrate.api.nvidia.com/v1/chat/completions',
      apiKey: process.env.NVIDIA_API_KEY || process.env.KIMI_API_KEY || '',
      model: 'moonshotai/kimi-k2.5',
    },
    deepseek: {
      url: 'https://api.deepseek.com/v1/chat/completions',
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      model: 'deepseek-chat',
    },
    glm5: {
      url: 'https://api.us-west-2.modal.direct/v1/chat/completions',
      apiKey: process.env.GLM5_API_KEY || '',
      model: 'zai-org/GLM-5-FP8',
    },
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function clampSentiment(raw: unknown): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return 3
  return Math.min(5, Math.max(1, Math.round(parsed)))
}

function normalizeIntent(raw: unknown): MessageClassification['intent'] {
  const valid: MessageClassification['intent'][] = ['compra', 'duvida', 'reclamacao', 'desistencia', 'negociacao', 'outro']
  const value = String(raw || '').toLowerCase() as MessageClassification['intent']
  return valid.includes(value) ? value : 'outro'
}

function normalizeFunnelStage(raw: unknown): MessageClassification['funnel_stage'] {
  const valid: MessageClassification['funnel_stage'][] = ['lead', 'negociacao', 'closed_won', 'closed_lost']
  const value = String(raw || '').toLowerCase() as MessageClassification['funnel_stage']
  return valid.includes(value) ? value : 'lead'
}

function normalizeConfidence(raw: unknown): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return 0.5
  return Math.max(0, Math.min(1, parsed))
}

function normalizeValueCents(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(0, Math.round(parsed))
}

function parseClassificationContent(content: string): MessageClassification {
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return getDefaultClassification()
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
    return {
      intent: normalizeIntent(parsed.intent),
      funnel_stage: normalizeFunnelStage(parsed.funnel_stage),
      sentiment: clampSentiment(parsed.sentiment),
      needs_attention: Boolean(parsed.needs_attention),
      attention_reason: typeof parsed.attention_reason === 'string' ? parsed.attention_reason : undefined,
      value_cents: normalizeValueCents(parsed.value_cents),
      confidence: normalizeConfidence(parsed.confidence),
    }
  } catch {
    return getDefaultClassification()
  }
}

async function classifyWithProvider(
  provider: ProviderName,
  config: ProviderConfig,
  text: string,
  contactName?: string
): Promise<MessageClassification> {
  const maxRetries = 5
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Contato: ${contactName || 'Cliente'}\nMensagem: "${text}"` }
          ],
          max_tokens: 200,
          temperature: 0.1,
        }),
      })

      if (!response.ok) {
        if (response.status === 429) {
          const waitTime = Math.pow(2, attempt) * 1000 + Math.random() * 1000
          console.log(`[LLM] ${provider} rate limit, aguardando ${Math.round(waitTime / 1000)}s (tentativa ${attempt + 1}/${maxRetries})`)
          await sleep(waitTime)
          continue
        }

        const bodyText = await response.text().catch(() => '')
        throw new Error(`LLM API error (${provider}): ${response.status}${bodyText ? ` - ${bodyText}` : ''}`)
      }

      const data = await response.json() as { choices: Array<{ message: { content: string } }> }
      const content = data.choices?.[0]?.message?.content || '{}'
      return parseClassificationContent(content)
    } catch (err) {
      lastError = err as Error
      const message = String(lastError.message || '').toLowerCase()
      const retryable = message.includes('429')
        || message.includes('rate limit')
        || message.includes('fetch failed')
        || message.includes('timeout')
        || message.includes('econn')
        || message.includes('socket')

      if (attempt < maxRetries - 1 && retryable) {
        const waitTime = Math.pow(2, attempt) * 1000
        console.log(`[LLM] ${provider} erro, tentando novamente em ${waitTime}ms`)
        await sleep(waitTime)
      } else {
        throw lastError
      }
    }
  }

  throw lastError || new Error(`Max retries exceeded (${provider})`)
}

export async function classifyMessage(
  text: string,
  contactName?: string
): Promise<MessageClassification> {
  const providerPreference = (process.env.LLM_PROVIDER || 'kimi').toLowerCase() as ProviderName
  const configs = getProviderConfigs()
  const availableProviders: ProviderName[] = ['kimi', 'deepseek', 'glm5']

  const primary = availableProviders.includes(providerPreference) ? providerPreference : 'kimi'
  const providerOrder: ProviderName[] = [
    primary,
    ...availableProviders.filter((p) => p !== primary),
  ]

  const configuredOrder = providerOrder.filter((provider) => Boolean(configs[provider].apiKey))
  if (configuredOrder.length === 0) {
    console.error(`[LLM] Nenhuma API key configurada para providers (${providerOrder.join(', ')})`)
    return getDefaultClassification()
  }

  let lastError: Error | null = null
  for (const provider of configuredOrder) {
    try {
      if (provider !== primary) {
        console.warn(`[LLM] Usando fallback provider: ${provider}`)
      }
      return await classifyWithProvider(provider, configs[provider], text, contactName)
    } catch (error) {
      lastError = error as Error
      console.error(`[LLM] Provider ${provider} falhou: ${lastError.message}`)
    }
  }

  throw lastError || new Error('All configured LLM providers failed')
}

function getDefaultClassification(): MessageClassification {
  return {
    intent: 'outro',
    funnel_stage: 'lead',
    sentiment: 3,
    needs_attention: false,
    confidence: 0,
  }
}

/**
 * Detecta se é uma venda
 */
export function isSale(classification: MessageClassification): boolean {
  return classification.funnel_stage === 'closed_won' && classification.confidence > 0.7
}

/**
 * Detecta se perdeu a venda
 */
export function isLost(classification: MessageClassification): boolean {
  return classification.funnel_stage === 'closed_lost' && classification.confidence > 0.7
}
