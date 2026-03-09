/**
 * LLM Provider Registry
 * Supervisor Comercial
 *
 * NUNCA Groq para chat
 * NUNCA Ollama
 *
 * Providers: GLM-5, Kimi, DeepSeek, Premium (Opus/GPT)
 */
// ============================================================
// PROVIDER CONFIGS
// ============================================================
function getProviderConfig(name) {
    switch (name) {
        case 'glm5':
            return {
                name: 'glm5',
                baseUrl: process.env.GLM5_BASE_URL || '',
                apiKey: process.env.GLM5_API_KEY || '',
                modelCheap: process.env.GLM5_MODEL_CHEAP || 'zai-org/GLM-5-FP8',
                modelSmart: process.env.GLM5_MODEL_SMART || 'zai-org/GLM-5-FP8',
            };
        case 'kimi':
            return {
                name: 'kimi',
                baseUrl: process.env.KIMI_BASE_URL || '',
                apiKey: process.env.KIMI_API_KEY || '',
                modelCheap: process.env.KIMI_MODEL_CHEAP || 'moonshotai/kimi-k2.5',
                modelSmart: process.env.KIMI_MODEL_SMART || 'moonshotai/kimi-k2.5',
            };
        case 'deepseek':
            return {
                name: 'deepseek',
                baseUrl: process.env.DEEPSEEK_BASE_URL || '',
                apiKey: process.env.DEEPSEEK_API_KEY || '',
                modelCheap: process.env.DEEPSEEK_MODEL_CHEAP || 'deepseek-chat',
                modelSmart: process.env.DEEPSEEK_MODEL_SMART || 'deepseek-chat',
            };
        case 'opus':
            return {
                name: 'opus',
                baseUrl: process.env.OPUS_BASE_URL || 'https://api.anthropic.com/v1',
                apiKey: process.env.OPUS_API_KEY || '',
                modelCheap: process.env.OPUS_MODEL || 'claude-opus-4-6',
                modelSmart: process.env.OPUS_MODEL || 'claude-opus-4-6',
            };
        case 'gpt':
            return {
                name: 'gpt',
                baseUrl: process.env.GPT_BASE_URL || 'https://api.openai.com/v1',
                apiKey: process.env.GPT_API_KEY || '',
                modelCheap: process.env.GPT_MODEL || 'gpt-4o-mini',
                modelSmart: process.env.GPT_MODEL || 'gpt-4o',
            };
        default:
            return null;
    }
}
// ============================================================
// OPENAI-COMPATIBLE CLIENT
// ============================================================
async function callOpenAICompatible(provider, messages, modelTier, options = {}) {
    const model = modelTier === 'smart' ? provider.modelSmart : provider.modelCheap;
    const startTime = Date.now();
    const body = {
        model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 4096,
    };
    if (options.response_format) {
        body.response_format = options.response_format;
    }
    // Anthropic tem formato diferente
    if (provider.name === 'opus') {
        const systemMsg = messages.find(m => m.role === 'system');
        const userMessages = messages.filter(m => m.role !== 'system');
        const anthropicBody = {
            model,
            max_tokens: body.max_tokens,
            system: systemMsg?.content,
            messages: userMessages.map(m => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content,
            })),
        };
        const response = await fetch(`${provider.baseUrl}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': provider.apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(anthropicBody),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Anthropic error: ${response.status} - ${errorText}`);
        }
        const result = await response.json();
        return {
            content: result.content[0]?.text || '',
            model,
            provider: provider.name,
            tokens_input: result.usage?.input_tokens,
            tokens_output: result.usage?.output_tokens,
            latency_ms: Date.now() - startTime,
        };
    }
    // OpenAI-compatible
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM error (${provider.name}): ${response.status} - ${errorText}`);
    }
    const result = await response.json();
    return {
        content: result.choices[0]?.message?.content || '',
        model,
        provider: provider.name,
        tokens_input: result.usage?.prompt_tokens,
        tokens_output: result.usage?.completion_tokens,
        latency_ms: Date.now() - startTime,
    };
}
function getRouterConfig() {
    return {
        primaryProvider: process.env.PRIMARY_CHAT_PROVIDER || 'glm5',
        fallbackProviders: (process.env.FALLBACK_CHAT_PROVIDERS || 'kimi,deepseek')
            .split(',')
            .map(p => p.trim())
            .filter(Boolean),
        premiumProvider: process.env.PREMIUM_CHAT_PROVIDER || 'opus',
    };
}
/**
 * Chat completion com fallback automático
 */
export async function chatComplete(messages, options = {}) {
    const config = getRouterConfig();
    const tier = options.tier || 'cheap';
    // Ordem de providers
    const providers = [];
    if (options.usePremium) {
        providers.push(config.premiumProvider);
    }
    else {
        providers.push(config.primaryProvider);
        providers.push(...config.fallbackProviders);
    }
    const errors = [];
    for (const providerName of providers) {
        const provider = getProviderConfig(providerName);
        if (!provider || !provider.apiKey) {
            continue;
        }
        try {
            console.log(`[LLM] Trying ${providerName} (${tier})...`);
            const response = await callOpenAICompatible(provider, messages, tier, options);
            console.log(`[LLM] ✓ ${providerName} responded in ${response.latency_ms}ms`);
            return response;
        }
        catch (error) {
            console.error(`[LLM] ✗ ${providerName} failed:`, error);
            errors.push(error);
        }
    }
    throw new Error(`All LLM providers failed. Errors: ${errors.map(e => e.message).join('; ')}`);
}
/**
 * Chat com validação de JSON (Zod) + retries
 */
export async function chatCompleteJson(messages, schema, options = {}) {
    const maxRetries = options.maxRetries ?? 2;
    const errors = [];
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await chatComplete(messages, {
                ...options,
                response_format: { type: 'json_object' },
            });
            // Parse JSON
            const json = JSON.parse(response.content);
            // Validate with Zod
            const data = schema.parse(json);
            return { data, response };
        }
        catch (error) {
            errors.push(error);
            if (attempt < maxRetries) {
                console.log(`[LLM] JSON validation failed, retrying... (${attempt + 1}/${maxRetries})`);
            }
        }
    }
    // Se esgotou retries, tenta premium
    if (!options.usePremium) {
        console.log('[LLM] All retries failed, trying premium...');
        try {
            const response = await chatComplete(messages, {
                ...options,
                response_format: { type: 'json_object' },
                usePremium: true,
            });
            const json = JSON.parse(response.content);
            const data = schema.parse(json);
            return { data, response };
        }
        catch (error) {
            errors.push(error);
        }
    }
    throw new Error(`JSON validation failed after ${maxRetries} retries. Errors: ${errors.map(e => e.message).join('; ')}`);
}
// ============================================================
// EXPORT
// ============================================================
export const llm = {
    chatComplete,
    chatCompleteJson,
    getProviderConfig,
    getRouterConfig,
};
export default llm;
//# sourceMappingURL=index.js.map