/**
 * STT Provider - Groq (APENAS Speech-to-Text)
 * PROIBIDO usar Groq para chat/completions
 *
 * Endpoint: /audio/transcriptions
 * Default: whisper-large-v3-turbo
 */
function getConfig() {
    return {
        baseUrl: process.env.GROQ_STT_BASE_URL || 'https://api.groq.com/openai/v1',
        apiKey: process.env.GROQ_STT_API_KEY || '',
        model: process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo',
    };
}
// ============================================================
// STT CLIENT
// ============================================================
/**
 * Transcreve áudio via Groq STT (OpenAI-compatible)
 * Endpoint: POST /audio/transcriptions
 */
export async function transcribeAudio(audioData, filename, options = {}) {
    const config = getConfig();
    if (!config.apiKey) {
        throw new Error('GROQ_STT_API_KEY não configurado');
    }
    // Construir FormData
    const formData = new FormData();
    // Converter para Blob se necessário
    const blob = audioData instanceof Buffer
        ? new Blob([audioData])
        : new Blob([audioData]);
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
    const result = await response.json();
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
export async function transcribeFromUrl(url, options = {}) {
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
export async function transcribeFromBase64(base64, mimeType = 'audio/ogg', options = {}) {
    // Converter base64 para Buffer
    const base64Data = base64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    // Determinar extensão
    const ext = mimeType.split('/')[1] || 'ogg';
    const filename = `audio.${ext}`;
    return transcribeAudio(buffer, filename, options);
}
/**
 * Testa conexão com Groq STT
 */
export async function testConnection() {
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
    }
    catch (error) {
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
    testConnection,
};
export default stt;
//# sourceMappingURL=index.js.map