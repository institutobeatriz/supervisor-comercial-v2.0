/**
 * Database Pool - PostgreSQL com pg
 * Supervisor Comercial
 */
import pg from 'pg';
const { Pool: PgPool } = pg;
// Estado global do pool
let pool = null;
/**
 * Obtém ou cria o pool de conexões
 */
export function getPool(config) {
    if (pool)
        return pool;
    const connectionString = config?.connectionString || process.env.DATABASE_URL;
    const poolConfig = {
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
export async function query(sql, params) {
    const p = getPool();
    return p.query(sql, params);
}
/**
 * Obtém uma conexão do pool para transação
 */
export async function getClient() {
    const p = getPool();
    return p.connect();
}
/**
 * Executa função dentro de uma transação
 */
export async function transaction(fn) {
    const client = await getClient();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
/**
 * Testa a conexão
 */
export async function ping() {
    try {
        const result = await query('SELECT 1 as ping');
        return result.rows[0]?.ping === 1;
    }
    catch {
        return false;
    }
}
/**
 * Fecha o pool de conexões
 */
export async function close() {
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
    async insert(table, data) {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
        const columns = keys.join(', ');
        const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`;
        const result = await query(sql, values);
        return result.rows[0];
    },
    // Update helper
    async update(table, data, where, whereParams) {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
        const sql = `UPDATE ${table} SET ${setClause} WHERE ${where} RETURNING *`;
        const result = await query(sql, [...values, ...whereParams]);
        return result.rows[0] || null;
    },
    // Find one helper
    async findOne(table, where, params) {
        const sql = `SELECT * FROM ${table} WHERE ${where} LIMIT 1`;
        const result = await query(sql, params);
        return result.rows[0] || null;
    },
    // Find many helper
    async findMany(table, where, params, options) {
        let sql = `SELECT * FROM ${table}`;
        const queryParams = [];
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
        const result = await query(sql, queryParams);
        return result.rows;
    },
    // Delete helper
    async delete(table, where, params) {
        const sql = `DELETE FROM ${table} WHERE ${where}`;
        const result = await query(sql, params);
        return result.rowCount || 0;
    },
};
export default db;
//# sourceMappingURL=pool.js.map