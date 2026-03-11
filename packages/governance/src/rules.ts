/**
 * Regras determinísticas para ações críticas
 */

export interface RuleInput {
  text: string;
  suggestedStage?: string;
  suggestedValue?: number;
  confidence?: number;
  hasPaymentConfirmation?: boolean;
  contactName?: string;
  messageHistory?: Array<{ text: string; direction: string }>;
}

export type RuleAction = 'accept' | 'reject' | 'escalate';

export interface Gap {
  type: 'missing_info' | 'low_confidence' | 'contradiction' | 'rule_violation' | 'no_payment_confirmation';
  description: string;
  suggestedAction: string;
  priority: 'high' | 'medium' | 'low';
  relatedStepId?: string;
}

export interface RuleResult {
  action: RuleAction;
  reason: string;
  ruleId: string;
  needsHumanReview: boolean;
  gap?: Gap;
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  condition: (input: RuleInput) => boolean;
  action: RuleAction;
  reason: string;
  priority: number;
}

export const WON_RULES: Rule[] = [
  {
    id: 'won_payment_required',
    name: 'Confirmação de pagamento obrigatória',
    description: 'Uma venda só pode ser fechada com confirmação explícita de pagamento',
    condition: (input) => 
      input.suggestedStage === 'closed_won' && 
      input.hasPaymentConfirmation === false,
    action: 'reject',
    reason: 'Mensagem não contém confirmação de pagamento explícita',
    priority: 100,
  },
  
  {
    id: 'won_min_length',
    name: 'Tamanho mínimo de mensagem',
    description: 'Mensagens muito curtas não podem ser vendas',
    condition: (input) => 
      input.suggestedStage === 'closed_won' && 
      input.text.length < 10,
    action: 'reject',
    reason: 'Mensagem muito curta para ser uma venda',
    priority: 90,
  },
  
  {
    id: 'won_high_value_review',
    name: 'Valores altos precisam confirmação',
    description: 'Vendas acima de R$ 1000 requerem revisão humana',
    condition: (input) => 
      input.suggestedStage === 'closed_won' && 
      (input.suggestedValue || 0) > 100000,
    action: 'escalate',
    reason: 'Venda de alto valor requer confirmação humana',
    priority: 80,
  },
  
  {
    id: 'won_low_confidence',
    name: 'Baixa confiança requer análise',
    description: 'Classificação com confiança baixa deve ser revisada',
    condition: (input) => 
      input.suggestedStage === 'closed_won' && 
      (input.confidence || 0) < 0.7,
    action: 'escalate',
    reason: 'Classificação com baixa confiança requer revisão',
    priority: 70,
  },
  
  {
    id: 'won_negative_words',
    name: 'Palavras negativas bloqueiam venda',
    description: 'Palavras como "não", "cancelar", "desistir" impedem won',
    condition: (input) => {
      if (input.suggestedStage !== 'closed_won') return false;
      const negators = /\b(n[aã]o\s+(quero|posso|vou)|cancelar|desistir|devolver)\b/i;
      return negators.test(input.text);
    },
    action: 'reject',
    reason: 'Mensagem contém palavras que indicam desistência ou cancelamento',
    priority: 85,
  },
];

export const LOST_RULES: Rule[] = [
  {
    id: 'lost_explicit_rejection',
    name: 'Rejeição explícita',
    description: 'Rejeição clara do cliente',
    condition: (input) => 
      input.suggestedStage === 'closed_lost' && 
      /\b(n[aã]o\s+(quero|tenho\s+interesse)|desisti|cancela[dr]|devolve[r])\b/i.test(input.text),
    action: 'accept',
    reason: 'Cliente expressou desistência explicitamente',
    priority: 100,
  },
  
  {
    id: 'lost_competitor',
    name: 'Mencionou concorrente',
    description: 'Cliente fechou com concorrente',
    condition: (input) => 
      input.suggestedStage === 'closed_lost' && 
      /(fechei\s+com\s+outr|comprefrom\s+outro|outro\s+valor|mais\s+barato)/i.test(input.text),
    action: 'accept',
    reason: 'Cliente fechou com concorrente',
    priority: 90,
  },
  
  {
    id: 'lost_low_confidence',
    name: 'Perda com baixa confiança',
    description: 'Classificação de perda com confiança baixa deve ser revisada',
    condition: (input) => 
      input.suggestedStage === 'closed_lost' && 
      (input.confidence || 0) < 0.6,
    action: 'escalate',
    reason: 'Classificação de perda com baixa confiança requer revisão',
    priority: 70,
  },
];

export const ALL_RULES: Rule[] = [...WON_RULES, ...LOST_RULES].sort((a, b) => b.priority - a.priority);

export function applyRules(input: RuleInput): RuleResult | null {
  const rules = input.suggestedStage === 'closed_won' ? WON_RULES :
                input.suggestedStage === 'closed_lost' ? LOST_RULES :
                [];
  
  for (const rule of rules) {
    if (rule.condition(input)) {
      return {
        action: rule.action,
        reason: rule.reason,
        ruleId: rule.id,
        needsHumanReview: rule.action === 'escalate',
        gap: rule.action !== 'accept' ? {
          type: 'rule_violation',
          description: rule.reason,
          suggestedAction: rule.action === 'reject' ? 'Reclassificar' : 'Revisar manualmente',
          priority: rule.priority >= 80 ? 'high' : 'medium',
        } : undefined,
      };
    }
  }
  
  return null;
}

export function validateWon(input: RuleInput): RuleResult | null {
  return applyRules({ ...input, suggestedStage: 'closed_won' });
}

export function validateLost(input: RuleInput): RuleResult | null {
  return applyRules({ ...input, suggestedStage: 'closed_lost' });
}

export function hasPaymentConfirmation(text: string): boolean {
  const patterns = [
    /paguei/i,
    /pagamento\s*(feito|realizado|confirmado)/i,
    /pix\s*(enviado|feito|mandei|realizado)/i,
    /transfer[iê].*feita/i,
    /deposit[iu]/i,
    /comprovante\s*(enviado|anexado|em anexo)/i,
    /comprei\s*(o\s*)?pacote/i,
    /fechei\s*(o\s*)?pacote/i,
    /valor\s+(confirmado|pago)/i,
  ];
  
  const negators = [
    /manda\s*(o\s*)?comprovante/i,
    /me\s*manda/i,
    /pode\s*mandar/i,
    /preciso\s*(do\s*)?comprovante/i,
    /quero\s*(ver\s*)?o\s*comprovante/i,
    /quanto\s*(custa|é)/i,
    /qual\s*(o\s*)?valor/i,
    /ainda\s*n[aã]o\s*(paguei|fiz)/i,
    /vou\s*(ver|pensar|passar)/i,
    /^combinado$/i,
    /^certo$/i,
    /^ok$/i,
    /^blz$/i,
    /^belez$/i,
  ];
  
  if (negators.some(regex => regex.test(text))) {
    return false;
  }
  
  return patterns.some(regex => regex.test(text));
}

export function extractValue(text: string): number | null {
  const patterns = [
    /R?\$?\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/,
    /(\d+)\s*(reais?|r\$)/i,
    /pacote\s*(de\s*)?(\d+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const valueStr = match[1] || match[2];
      const value = parseFloat(valueStr.replace(/\./g, '').replace(',', '.'));
      if (!isNaN(value) && value > 0) {
        return Math.round(value * 100);
      }
    }
  }
  
  return null;
}
