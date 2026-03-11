/**
 * Detecção Automática de Comprovantes
 * Sistema para identificar comprovantes de pagamento em imagens
 */

// Palavras-chave que indicam comprovante
const COMPROVANTE_KEYWORDS = [
  'comprovante', 'transfer', 'pix', 'pagamento', 'deposito',
  'banco', 'agencia', 'conta', 'valor', 'data', 'autenticacao'
];

// Padrões de valor monetário
const VALUE_PATTERNS = [
  /R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/g,
  /(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*(?:reais?|R\$)/gi
];

// Detectar se imagem é comprovante (baseado no caption)
function isComprovante(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return COMPROVANTE_KEYWORDS.some(kw => lower.includes(kw));
}

// Extrair valor do texto
function extractValue(text) {
  if (!text) return null;
  
  for (const pattern of VALUE_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const value = match[1].replace(/\./g, '').replace(',', '.');
      return parseFloat(value) * 100; // centavos
    }
  }
  return null;
}

module.exports = { isComprovante, extractValue };
