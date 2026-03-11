/**
 * RAG Retrieval - Bíblia de Vendas
 * Supervisor Comercial
 */

import { query } from '@supervisor/db';
import { generateEmbedding, isRagVectorEnabled } from '@supervisor/embeddings';

// ============================================================
// TYPES
// ============================================================

export interface RagChunk {
  id: string;
  conversation_id: string;
  chunk_text: string;
  embedding: number[] | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface SearchResult {
  id: string;
  chunk_text: string;
  metadata: Record<string, unknown>;
  distance?: number;
  similarity?: number;
}

// ============================================================
// VECTOR SEARCH (pgvector)
// ============================================================

/**
 * Busca chunks similares usando pgvector (similaridade cosseno)
 * Operador <=> é distância cosseno
 */
export async function searchSimilarChunks(
  queryEmbedding: number[],
  options: {
    objection?: string;
    topK?: number;
    threshold?: number;
  } = {}
): Promise<SearchResult[]> {
  const { objection, topK = 5, threshold = 0.3 } = options;
  
  const embeddingStr = `[${queryEmbedding.join(',')}]`;
  
  let sql = `
    SELECT 
      id, 
      chunk_text, 
      metadata, 
      (embedding <=> $1::vector) AS distance
    FROM rag_chunks
    WHERE embedding IS NOT NULL
  `;
  
  const params: unknown[] = [embeddingStr];
  
  if (objection) {
    sql += ` AND metadata->>'objection' = $${params.length + 1}`;
    params.push(objection);
  }
  
  sql += `
    ORDER BY embedding <=> $1::vector
    LIMIT $${params.length + 1}
  `;
  params.push(topK);
  
  const result = await query<{
    id: string;
    chunk_text: string;
    metadata: Record<string, unknown>;
    distance: number;
  }>(sql, params);
  
  return result.rows.map(row => ({
    id: row.id,
    chunk_text: row.chunk_text,
    metadata: row.metadata,
    distance: row.distance,
    similarity: 1 - row.distance, // Converter distância para similaridade
  })).filter(r => r.distance! <= threshold);
}

// ============================================================
// TEXT SEARCH (Fallback quando RAG_VECTOR=false)
// ============================================================

/**
 * Busca textual por ILIKE e full-text search
 * Usado quando RAG_VECTOR=false
 */
export async function searchTextChunks(
  searchText: string,
  options: {
    objection?: string;
    topK?: number;
  } = {}
): Promise<SearchResult[]> {
  const { objection, topK = 5 } = options;
  
  let sql = `
    SELECT 
      id, 
      chunk_text, 
      metadata
    FROM rag_chunks
    WHERE chunk_text ILIKE $1
  `;
  
  const params: unknown[] = [`%${searchText}%`];
  
  if (objection) {
    sql += ` AND metadata->>'objection' = $${params.length + 1}`;
    params.push(objection);
  }
  
  sql += `
    ORDER BY created_at DESC
    LIMIT $${params.length + 1}
  `;
  params.push(topK);
  
  const result = await query<{
    id: string;
    chunk_text: string;
    metadata: Record<string, unknown>;
  }>(sql, params);
  
  return result.rows.map(row => ({
    id: row.id,
    chunk_text: row.chunk_text,
    metadata: row.metadata,
  }));
}

/**
 * Busca por tags/objection (fallback simples)
 */
export async function searchByObjection(
  objection: string,
  topK = 5
): Promise<SearchResult[]> {
  const result = await query<{
    id: string;
    chunk_text: string;
    metadata: Record<string, unknown>;
  }>(
    `SELECT id, chunk_text, metadata
     FROM rag_chunks
     WHERE metadata->>'objection' = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [objection, topK]
  );
  
  return result.rows.map(row => ({
    id: row.id,
    chunk_text: row.chunk_text,
    metadata: row.metadata,
  }));
}

// ============================================================
// UNIFIED SEARCH
// ============================================================

/**
 * Busca unificada - usa vector ou texto dependendo de RAG_VECTOR
 */
export async function search(
  queryText: string,
  options: {
    objection?: string;
    topK?: number;
    threshold?: number;
  } = {}
): Promise<SearchResult[]> {
  const vectorEnabled = isRagVectorEnabled();
  
  if (vectorEnabled) {
    try {
      // Gerar embedding da query
      const embResult = await generateEmbedding(queryText);
      
      // Buscar por similaridade
      return await searchSimilarChunks(embResult.embedding, options);
    } catch (error) {
      console.error('[RAG] Vector search failed, falling back to text:', error);
      // Fallback para busca textual
      return await searchTextChunks(queryText, options);
    }
  } else {
    // Busca textual simples
    return await searchTextChunks(queryText, options);
  }
}

// ============================================================
// BÍBLIA DE VENDAS HELPERS
// ============================================================

/**
 * Busca respostas para uma objeção específica
 */
export async function getObjectionHandler(
  objection: string,
  topK = 3
): Promise<SearchResult[]> {
  const vectorEnabled = isRagVectorEnabled();
  
  if (vectorEnabled) {
    // Buscar por objection + texto relacionado
    const queryText = `objection ${objection} how to handle response`;
    return await search(queryText, { objection, topK });
  } else {
    return await searchByObjection(objection, topK);
  }
}

/**
 * Busca melhores práticas
 */
export async function getBestPractices(
  context?: string,
  topK = 5
): Promise<SearchResult[]> {
  const queryText = context 
    ? `best practice ${context}`
    : 'best practice winning response';
  
  return await search(queryText, { topK });
}

// ============================================================
// EXPORT
// ============================================================

export const rag = {
  search,
  searchSimilarChunks,
  searchTextChunks,
  searchByObjection,
  getObjectionHandler,
  getBestPractices,
};

export default rag;
