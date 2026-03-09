/**
 * Serviço de OCR para Comprovantes
 * Usa Kimi API (suporta visão)
 */

const fetch = require('node-fetch');

const KIMI_API_KEY = process.env.KIMI_API_KEY;
const KIMI_API_URL = 'https://api.moonshot.cn/v1/chat/completions';

/**
 * Analisa imagem com Kimi Vision
 */
async function analyzeImage(imageUrl) {
  if (!KIMI_API_KEY) {
    console.log('[OCR] KIMI_API_KEY não configurada, usando detecção por caption');
    return null;
  }

  try {
    const response = await fetch(KIMI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KIMI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'moonshot-v1-8k-vision-preview',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analise esta imagem. É um comprovante de pagamento PIX/transferência?

Se SIM, extraia:
- valor: valor em reais (número)
- data: data da transação (DD/MM/AAAA)
- destinatario: nome de quem recebeu

Responda APENAS em JSON: { "isComprovante": true/false, "valor": 0, "data": "", "destinatario": "" }`
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl }
              }
            ]
          }
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Extrair JSON
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return { isComprovante: false };
  } catch (error) {
    console.error('[OCR] Erro:', error.message);
    return null;
  }
}

/**
 * Detecta comprovante pelo caption/texto
 */
function detectByCaption(text) {
  if (!text) return { isComprovante: false };
  
  const lower = text.toLowerCase();
  const keywords = ['comprovante', 'paguei', 'pix enviado', 'transferencia', 'deposito feito'];
  const hasKeyword = keywords.some(kw => lower.includes(kw));
  
  // Extrair valor
  const valueMatch = text.match(/R?\$?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/);
  const value = valueMatch ? parseFloat(valueMatch[1].replace(/\./g, '').replace(',', '.')) : null;
  
  return {
    isComprovante: hasKeyword,
    value: value,
    caption: text
  };
}

module.exports = { analyzeImage, detectByCaption };
