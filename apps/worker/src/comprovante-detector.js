/**
 * Detecção de Comprovantes
 * Integração com Worker
 */

const { analyzeImage, detectByCaption } = require('./ocr-kimi');

/**
 * Processa mensagem com mídia
 */
async function processMediaMessage(message, messageId, conversationId) {
  const rawEvent = message.raw_event;
  if (!rawEvent) return null;
  
  try {
    const parsed = typeof rawEvent === 'string' ? JSON.parse(rawEvent) : rawEvent;
    const msg = parsed.message || {};
    
    // Verificar se tem imagem
    const imageMsg = msg.imageMessage;
    if (!imageMsg) return null;
    
    const caption = imageMsg.caption || '';
    const imageUrl = imageMsg.url;
    
    console.log('[Comprovante] Processando mídia:', messageId);
    console.log('[Comprovante] Caption:', caption.substring(0, 50));
    
    // 1. Detectar pelo caption primeiro
    const captionResult = detectByCaption(caption);
    if (captionResult.isComprovante && captionResult.value) {
      console.log('[Comprovante] ✓ Detectado pelo caption! Valor:', captionResult.value);
      return {
        isComprovante: true,
        valueCents: Math.round(captionResult.value * 100),
        source: 'caption'
      };
    }
    
    // 2. Usar OCR se tiver URL
    if (imageUrl) {
      console.log('[Comprovante] Usando OCR...');
      const ocrResult = await analyzeImage(imageUrl);
      if (ocrResult && ocrResult.isComprovante) {
        console.log('[Comprovante] ✓ Detectado pelo OCR! Valor:', ocrResult.valor);
        return {
          isComprovante: true,
          valueCents: ocrResult.valor ? Math.round(ocrResult.valor * 100) : null,
          source: 'ocr',
          data: ocrResult.data,
          destinatario: ocrResult.destinatario
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('[Comprovante] Erro:', error.message);
    return null;
  }
}

/**
 * Verifica se texto indica comprovante
 */
function hasComprovanteIndicator(text) {
  const keywords = [
    'comprovante', 'paguei', 'pagamento', 'pix', 'transferencia',
    'deposito', 'enviei', 'valor', 'recebido'
  ];
  const lower = (text || '').toLowerCase();
  return keywords.some(kw => lower.includes(kw));
}

module.exports = { processMediaMessage, hasComprovanteIndicator };
