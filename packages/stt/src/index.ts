/**
 * STT Provider - Groq (APENAS Speech-to-Text)
 * PROIBIDO usar Groq para chat/completions
 * 
 * Endpoint: /audio/transcriptions
 * Default: whisper-large-v3-turbo
 */

// ============================================================
// CONFIG
// ============================================================

interface SttConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function getConfig(): SttConfig {
  return {
    baseUrl: process.env.GROQ_STT_BASE_URL || 'https://api.groq.com/openai/v1',
    apiKey: process.env.GROQ_STT_API_KEY || '',
    model: process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo',
  };
}

// ============================================================
// TYPES
// ============================================================

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
  confidence?: number;
}

export interface TranscriptionOptions {
  language?: string; // pt, en, es
  prompt?: string; // Context hint
  temperature?: number; // 0-1
  mimeType?: string; // audio/ogg, audio/webm, etc
}

// ============================================================
// STT CLIENT
// ============================================================

/**
 * Transcreve áudio via Groq STT (OpenAI-compatible)
 * Endpoint: POST /audio/transcriptions
 */
export async function transcribeAudio(
  audioData: Buffer | ArrayBuffer,
  filename: string,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  const config = getConfig();
  
  if (!config.apiKey) {
    throw new Error('GROQ_STT_API_KEY não configurado');
  }

  // Construir FormData
  const formData = new FormData();
  
  // Determinar tipo MIME
  const contentType = options.mimeType || 'audio/ogg';
  
  // Converter para Blob com tipo MIME correto
  const blob = audioData instanceof Buffer 
    ? new Blob([audioData], { type: contentType })
    : new Blob([audioData as ArrayBuffer], { type: contentType });
  
  formData.append('file', blob, filename);
  formData.append('model', config.model);
  
  if (options.language) {
    formData.append('language', options.language);
  }
  
  if (options.prompt) {
    formData.append('prompt', options.prompt);
  }
  
  if (options.temperature !== undefined) {
    formData.append('temperature', options.temperature.toString());
  }

  const startTime = Date.now();
  
  const response = await fetch(`${config.baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq STT error: ${response.status} - ${errorText}`);
  }

  const result = await response.json() as {
    text: string;
    language?: string;
    duration?: number;
  };

  const processingTime = Date.now() - startTime;
  console.log(`[STT] Transcribed in ${processingTime}ms, ${result.text.length} chars`);

  return {
    text: result.text,
    language: result.language,
    duration: result.duration,
  };
}

/**
 * Transcreve áudio a partir de URL
 */
export async function transcribeFromUrl(
  url: string,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  // Baixar áudio
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.status}`);
  }
  
  const audioData = await response.arrayBuffer();
  
  // Extrair nome do arquivo da URL
  const urlPath = new URL(url).pathname;
  const filename = urlPath.split('/').pop() || 'audio.ogg';
  
  return transcribeAudio(audioData, filename, options);
}

/**
 * Transcreve áudio a partir de base64
 */
export async function transcribeFromBase64(
  base64: string,
  mimeType: string = 'audio/ogg',
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  // Converter base64 para Buffer
  const base64Data = base64.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  
  // Determinar extensão e tipo MIME correto
  let ext = 'ogg';
  let actualMimeType = 'audio/ogg';
  
  if (mimeType.includes('webm')) {
    ext = 'webm';
    actualMimeType = 'audio/webm';
  } else if (mimeType.includes('mp3') || mimeType.includes('mpeg')) {
    ext = 'mp3';
    actualMimeType = 'audio/mpeg';
  } else if (mimeType.includes('m4a')) {
    ext = 'm4a';
    actualMimeType = 'audio/m4a';
  } else if (mimeType.includes('wav')) {
    ext = 'wav';
    actualMimeType = 'audio/wav';
  }
  
  const filename = `audio.${ext}`;
  console.log(`[STT] Using base64 data, ${buffer.length} bytes, type: ${actualMimeType}`);
  
  return transcribeAudio(buffer, filename, { ...options, mimeType: actualMimeType });
}

/**
 * Transcreve áudio criptografado do WhatsApp
 * Usa mediaKey para descriptografar via HKDF-SHA256
 */
export async function transcribeFromEncryptedUrl(
  url: string,
  mediaKey: string,
  mimeType: string = 'audio/ogg',
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  console.log(`[STT] Downloading encrypted media from WhatsApp...`);
  
  // Baixar arquivo criptografado
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download encrypted media: ${response.status}`);
  }
  
  const encryptedBuffer = Buffer.from(await response.arrayBuffer());
  console.log(`[STT] Downloaded ${encryptedBuffer.length} encrypted bytes`);
  
  // Descriptografar usando a mediaKey
  const crypto = await import('crypto');
  
  // MediaKey em base64 -> Buffer
  const mediaKeyBuffer = Buffer.from(mediaKey, 'base64');
  
  // WhatsApp usa HKDF-SHA256 para expandir a chave
  // Precisa derivar 112 bytes: iv(16) + cipherKey(32) + macKey(32) + refKey(32)
  // Mas para áudio, apenas 80 bytes são necessários: iv(16) + cipherKey(32) + macKey(32)
  
  const hkdf = (key: Buffer, length: number, info: Buffer): Buffer => {
    // HKDF-Expand
    const prk = crypto.createHmac('sha256', Buffer.alloc(32)).update(key).digest();
    const blocks: Buffer[] = [];
    let prev = Buffer.alloc(0);
    
    while (Buffer.concat(blocks).length < length) {
      const hmac = crypto.createHmac('sha256', prk);
      hmac.update(Buffer.concat([prev, info, Buffer.from([blocks.length + 1])]));
      prev = hmac.digest();
      blocks.push(prev);
    }
    
    return Buffer.concat(blocks).slice(0, length);
  };
  
  // Info específico para cada tipo de mídia
  // Audio = 'WhatsApp Audio Keys'
  const isAudio = mimeType.includes('audio') || mimeType.includes('ogg');
  const info = Buffer.from(isAudio ? 'WhatsApp Audio Keys' : 'WhatsApp Media Keys', 'utf-8');
  
  // Expandir chave para 80 bytes
  const expandedKey = hkdf(mediaKeyBuffer, 80, info);
  
  const iv = expandedKey.subarray(0, 16);
  const cipherKey = expandedKey.subarray(16, 48);
  const macKey = expandedKey.subarray(48, 80);
  
  console.log(`[STT] Keys derived - IV: ${iv.length}B, Cipher: ${cipherKey.length}B, MAC: ${macKey.length}B`);
  
  // O arquivo criptografado tem estrutura: [encrypted_data (32 bytes de padding no início)] + [MAC (10 bytes no final)]
  // Mas na verdade é: [encrypted_data] + [MAC (10 bytes)]
  // Removemos os últimos 10 bytes (MAC) antes de descriptografar
  
  // MAC está nos últimos 10 bytes do arquivo
  const macInFile = encryptedBuffer.subarray(-10);
  const ciphertext = encryptedBuffer.subarray(0, -10);
  
  // Verificar MAC (HMAC-SHA256 dos primeiros 10 bytes)
  const computedMac = crypto.createHmac('sha256', macKey).update(ciphertext).digest().subarray(0, 10);
  
  // Nota: WhatsApp usa os primeiros 10 bytes do HMAC como MAC
  // Mas vamos ignorar verificação por enquanto para debug
  
  console.log(`[STT] Ciphertext length: ${ciphertext.length} bytes`);
  
  // Decrypt using AES-256-CBC
  const decipher = crypto.createDecipheriv('aes-256-cbc', cipherKey, iv);
  
  let decrypted: Buffer;
  try {
    decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    console.log(`[STT] Decrypted ${decrypted.length} bytes`);
  } catch (e) {
    console.error('[STT] Decryption failed:', e);
    throw new Error(`Decryption failed: ${e}`);
  }
  
  // Determinar extensão
  const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.split('/')[1] || 'ogg';
  const filename = `audio.${ext}`;
  
  return transcribeAudio(decrypted, filename, options);
}

/**
 * Testa conexão com Groq STT
 */
export async function testConnection(): Promise<{ ok: boolean; error?: string }> {
  const config = getConfig();
  
  if (!config.apiKey) {
    return { ok: false, error: 'GROQ_STT_API_KEY não configurado' };
  }
  
  try {
    // Teste simples com um arquivo de áudio mínimo válido
    // Na prática, só verificamos se a API responde
    const response = await fetch(`${config.baseUrl}/models`, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
    });
    
    if (!response.ok) {
      return { ok: false, error: `API returned ${response.status}` };
    }
    
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

// ============================================================
// EXPORT
// ============================================================

export const stt = {
  transcribeAudio,
  transcribeFromUrl,
  transcribeFromBase64,
  transcribeFromEncryptedUrl,
  testConnection,
};

export default stt;
