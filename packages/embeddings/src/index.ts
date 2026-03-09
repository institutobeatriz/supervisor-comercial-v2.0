/**
 * Embeddings Provider
 * Supervisor Comercial - RAG
 * 
 * Provedor SEPARADO para embeddings (OpenAI-compatible)
 * NUNCA usar Groq para embeddings
 */

// ============================================================
// CONFIG
// ============================================================

interface EmbeddingsConfig {
  providerUrl: string;
  apiKey: string;
  model: string;
  dimension: number;
}

function getConfig(): EmbeddingsConfig {
  return {
    providerUrl: process.env.EMBEDDING_PROVIDER_URL || 'https://api.openai.com/v1',
    apiKey: process.env.EMBEDDING_API_KEY || '',
    model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    dimension: parseInt(process.env.EMBEDDING_DIMENSION || '1536'),
  };
}

// RAG_VECTOR feature flag
export function isRagVectorEnabled(): boolean {
  return process.env.RAG_VECTOR === 'true';
}

// ============================================================
// TYPES
// ============================================================

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  tokens: number;
}

// ============================================================
// EMBEDDINGS CLIENT
// ============================================================

/**
 * Gera embedding para um texto
 * Endpoint: POST /embeddings
 */
export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  const config = getConfig();
  
  if (!config.apiKey) {
    throw new Error('EMBEDDING_API_KEY não configurado');
  }
  
  if (!isRagVectorEnabled()) {
    throw new Error('RAG_VECTOR está desabilitado');
  }

  const startTime = Date.now();
  
  const response = await fetch(`${config.providerUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      input: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embeddings error: ${response.status} - ${errorText}`);
  }

  const result = await response.json() as {
    data: Array<{ embedding: number[] }>;
    model: string;
    usage: { total_tokens: number };
  };

  const latency = Date.now() - startTime;
  console.log(`[Embeddings] Generated in ${latency}ms, ${result.usage.total_tokens} tokens`);

  return {
    embedding: result.data[0]?.embedding || [],
    model: result.model,
    tokens: result.usage.total_tokens,
  };
}

/**
 * Gera embeddings para múltiplos textos (batch)
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<EmbeddingResult[]> {
  const config = getConfig();
  
  if (!config.apiKey) {
    throw new Error('EMBEDDING_API_KEY não configurado');
  }
  
  if (!isRagVectorEnabled()) {
    throw new Error('RAG_VECTOR está desabilitado');
  }

  const response = await fetch(`${config.providerUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      input: texts,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embeddings error: ${response.status} - ${errorText}`);
  }

  const result = await response.json() as {
    data: Array<{ embedding: number[] }>;
    model: string;
    usage: { total_tokens: number };
  };

  return result.data.map((d, i) => ({
    embedding: d.embedding,
    model: result.model,
    tokens: Math.floor(result.usage.total_tokens / texts.length),
  }));
}

/**
 * Testa conexão com provider de embeddings
 */
export async function testConnection(): Promise<{ ok: boolean; error?: string }> {
  const config = getConfig();
  
  if (!config.apiKey) {
    return { ok: false, error: 'EMBEDDING_API_KEY não configurado' };
  }
  
  try {
    await generateEmbedding('test');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

// ============================================================
// EXPORT
// ============================================================

export const embeddings = {
  generateEmbedding,
  generateEmbeddings,
  isRagVectorEnabled,
  testConnection,
};

export default embeddings;
