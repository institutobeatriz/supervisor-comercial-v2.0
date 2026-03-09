/**
 * Database Pool - PostgreSQL com pg
 * Supervisor Comercial
 */

import pg from 'pg';
import type { Pool, PoolClient, QueryResult } from 'pg';

const { Pool: PgPool, types } = pg;

// Por padrão o pg converte o tipo 'date' (OID 1082) para Date object,
// o que causa serialização como ISO timestamp. Retornamos a string "YYYY-MM-DD".
types.setTypeParser(1082, (val: string) => val);

// Configuração do pool
interface DbConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  min?: number;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

// Estado global do pool
let pool: Pool | null = null;

/**
 * Obtém ou cria o pool de conexões
 */
export function getPool(config?: DbConfig): Pool {
  if (pool) return pool;

  const connectionString = config?.connectionString || process.env.DATABASE_URL;

  const poolConfig: DbConfig = {
    // Se tem DATABASE_URL, usar ela
    ...(connectionString ? { connectionString } : {
      host: config?.host || process.env.DB_HOST || 'localhost',
      port: config?.port || parseInt(process.env.DB_PORT || '5432'),
      user: config?.user || process.env.DB_USER || 'app',
      password: config?.password || process.env.DB_PASSWORD || 'app',
      database: config?.database || process.env.DB_NAME || 'sales_supervisor',
    }),
    // Pool settings
    min: config?.min || parseInt(process.env.DB_POOL_MIN || '2'),
    max: config?.max || parseInt(process.env.DB_POOL_MAX || '10'),
    idleTimeoutMillis: config?.idleTimeoutMillis || 30000,
    connectionTimeoutMillis: config?.connectionTimeoutMillis || 5000,
  };

  pool = new PgPool(poolConfig);

  // Log de erros de conexão
  pool.on('error', (err) => {
    console.error('[DB] Pool error:', err.message);
  });

  return pool;
}

/**
 * Executa uma query
 */
export async function query<T = unknown>(
  sql: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const p = getPool();
  return p.query<T>(sql, params);
}

/**
 * Obtém uma conexão do pool para transação
 */
export async function getClient(): Promise<PoolClient> {
  const p = getPool();
  return p.connect();
}

/**
 * Executa função dentro de uma transação
 */
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Testa a conexão
 */
export async function ping(): Promise<boolean> {
  try {
    const result = await query<{ ping: number }>('SELECT 1 as ping');
    return result.rows[0]?.ping === 1;
  } catch {
    return false;
  }
}

/**
 * Fecha o pool de conexões
 */
export async function close(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Helpers para queries comuns
 */
export const db = {
  query,
  getClient,
  transaction,
  ping,
  close,
  getPool,

  // Insert helper
  async insert<T = unknown>(table: string, data: T): Promise<T> {
    const keys = Object.keys(data as object);
    const values = Object.values(data as object);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const columns = keys.join(', ');

    const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`;
    const result = await query<T>(sql, values);
    return result.rows[0];
  },

  // Update helper
  async update<T = unknown>(
    table: string,
    data: Partial<T>,
    where: string,
    whereParams: unknown[]
  ): Promise<T | null> {
    const keys = Object.keys(data as object);
    const values = Object.values(data as object);
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');

    const sql = `UPDATE ${table} SET ${setClause} WHERE ${where} RETURNING *`;
    const result = await query<T>(sql, [...values, ...whereParams]);
    return result.rows[0] || null;
  },

  // Find one helper
  async findOne<T = unknown>(
    table: string,
    where: string,
    params: unknown[]
  ): Promise<T | null> {
    const sql = `SELECT * FROM ${table} WHERE ${where} LIMIT 1`;
    const result = await query<T>(sql, params);
    return result.rows[0] || null;
  },

  // Find many helper
  async findMany<T = unknown>(
    table: string,
    where?: string,
    params?: unknown[],
    options?: { limit?: number; offset?: number; orderBy?: string }
  ): Promise<T[]> {
    let sql = `SELECT * FROM ${table}`;
    const queryParams: unknown[] = [];

    if (where) {
      sql += ` WHERE ${where}`;
      queryParams.push(...(params || []));
    }

    if (options?.orderBy) {
      sql += ` ORDER BY ${options.orderBy}`;
    }

    if (options?.limit) {
      sql += ` LIMIT $${queryParams.length + 1}`;
      queryParams.push(options.limit);
    }

    if (options?.offset) {
      sql += ` OFFSET $${queryParams.length + 1}`;
      queryParams.push(options.offset);
    }

    const result = await query<T>(sql, queryParams);
    return result.rows;
  },

  // Delete helper
  async delete(table: string, where: string, params: unknown[]): Promise<number> {
    const sql = `DELETE FROM ${table} WHERE ${where}`;
    const result = await query(sql, params);
    return result.rowCount || 0;
  },
};

export default db;
