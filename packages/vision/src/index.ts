/**
 * @supervisor/vision
 * PDF text extraction and comprovante (payment receipt) detection.
 * Uses pdf-parse for text extraction — no Vision API cost for text-based PDFs.
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export interface ComprovanteResult {
  isComprovante: boolean;
  valorReais: number | null;
  tipoTransacao: 'pix' | 'ted' | 'boleto' | 'cartao' | null;
  method: 'text' | 'ocr' | 'none';
  rawText?: string;
}

/**
 * Extract plain text from a base64-encoded PDF.
 */
export async function extractPdfText(base64: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdf = require('pdf-parse/lib/pdf-parse.js') as (buf: Buffer) => Promise<{ text: string }>;
  const clean = base64.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(clean, 'base64');
  const data = await pdf(buffer);
  return data.text || '';
}

/**
 * Detect comprovante patterns in extracted text.
 */
export function detectComprovanteInText(text: string): ComprovanteResult {
  const isComprovante = [
    /comprovante/i,
    /pix\s*(enviado|aprovado|conclu[ií]do|realizado)/i,
    /transfer[eê]ncia\s*(realizada|conclu[ií]da|efetuada)/i,
    /pagamento\s*(aprovado|realizado|confirmado|efetuado)/i,
    /recibo\s*de\s*(pagamento|dep[oó]sito|transfer[eê]ncia)/i,
    /boleto\s*(pago|quitado|compensado)/i,
    /dep[oó]sito\s*(realizado|confirmado|efetuado)/i,
  ].some(r => r.test(text));

  if (!isComprovante) {
    return { isComprovante: false, valorReais: null, tipoTransacao: null, method: 'text' };
  }

  // Extract value: matches R$ 1.234,56 or R$ 197,00
  const valueMatch =
    text.match(/R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*),(\d{2})/) ||
    text.match(/([0-9]{1,3}(?:\.[0-9]{3})*),(\d{2})\s*(reais|BRL)/i);
  const valorReais = valueMatch
    ? parseFloat(valueMatch[1].replace(/\./g, '') + '.' + valueMatch[2])
    : null;

  // Detect transaction type
  let tipoTransacao: ComprovanteResult['tipoTransacao'] = null;
  if (/\bpix\b/i.test(text)) tipoTransacao = 'pix';
  else if (/\bted\b/i.test(text)) tipoTransacao = 'ted';
  else if (/\bboleto\b/i.test(text)) tipoTransacao = 'boleto';
  else if (/cart[aã]o|cr[eé]dito|d[eé]bito/i.test(text)) tipoTransacao = 'cartao';

  return { isComprovante: true, valorReais, tipoTransacao, method: 'text', rawText: text.slice(0, 500) };
}

/**
 * Analyze a base64-encoded PDF for payment receipt content.
 * Returns isComprovante=false with method='none' for scanned (image-only) PDFs.
 */
export async function analyzePdf(base64: string): Promise<ComprovanteResult> {
  try {
    const text = await extractPdfText(base64);
    if (text.trim().length > 100) {
      return detectComprovanteInText(text);
    }
    // Scanned PDF — text extraction yielded nothing meaningful
    return { isComprovante: false, valorReais: null, tipoTransacao: null, method: 'none' };
  } catch (err) {
    console.error('[Vision] PDF parse error:', err);
    return { isComprovante: false, valorReais: null, tipoTransacao: null, method: 'none' };
  }
}
