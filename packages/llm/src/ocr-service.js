/**
 * Serviço de OCR para Comprovantes
 * Detecta comprovantes de pagamento e extrai valores
 */

const fetch = require('node-fetch');

// Configuração OpenAI Vision
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_VISION_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Analisa imagem com OpenAI Vision
 */
async function analyzeImage(imageUrl) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY não configurada');
  }

  const response = await fetch(OPENAI_VISION_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analise esta imagem e determine:
1. É um comprovante de pagamento PIX/transferência? Responda SIM ou NÃO
2. Se SIM, qual o VALOR da transação em reais?
3. Qual a DATA da transação?
4. Qual o NOME do destinatário?

Responda em JSON: { "isComprovante": boolean, "valor": number, "data": "string", "destinatario": "string" }`
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl }
            }
          ]
        }
      ],
      max_tokens: 300,
    }),
  });

  const data = await response.json();
  const content = data.choices[0].message.content;
  
  // Extrair JSON da resposta
  const jsonMatch = content.match(/\{[^}]+\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  
  return { isComprovante: false };
}

/**
 * Processa mídia de uma mensagem
 */
async function processMedia(messageId, imageUrl, caption) {
  console.log('[OCR] Processando mídia:', messageId);
  
  // 1. Verificar caption primeiro
  if (caption && isComprovanteByCaption(caption)) {
    console.log('[OCR] Comprovante detectado pelo caption');
    return {
      isComprovante: true,
      caption: caption
    };
  }
  
  // 2. Analisar imagem com OCR
  try {
    const result = await analyzeImage(imageUrl);
    console.log('[OCR] Resultado:', result);
    return result;
  } catch (error) {
    console.error('[OCR] Erro:', error.message);
    return { isComprovante: false, error: error.message };
  }
}

function isComprovanteByCaption(text) {
  if (!text) return false;
  const keywords = ['comprovante', 'pix', 'pagamento', 'transfer', 'deposito'];
  return keywords.some(kw => text.toLowerCase().includes(kw));
}

module.exports = { analyzeImage, processMedia, isComprovanteByCaption };
