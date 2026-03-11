/**
 * Migration Runner
 * Supervisor Comercial
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, close } from './pool.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/**
 * Cria tabela de controle de migrações
 */
async function ensureMigrationsTable() {
    await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}
/**
 * Lista migrações já aplicadas
 */
async function getAppliedMigrations() {
    const result = await query('SELECT filename FROM _migrations ORDER BY id');
    return result.rows.map((r) => r.filename);
}
/**
 * Lê arquivos de migração
 */
function readMigrationFiles(migrationsDir) {
    const files = fs.readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();
    return files.map((filename) => ({
        filename,
        sql: fs.readFileSync(path.join(migrationsDir, filename), 'utf-8'),
    }));
}
/**
 * Aplica uma migração
 */
async function applyMigration(migration) {
    console.log(`[MIGRATE] Applying: ${migration.filename}`);
    await query('BEGIN');
    try {
        await query(migration.sql);
        await query('INSERT INTO _migrations (filename) VALUES ($1)', [migration.filename]);
        await query('COMMIT');
        console.log(`[MIGRATE] ✓ Applied: ${migration.filename}`);
    }
    catch (error) {
        await query('ROLLBACK');
        throw error;
    }
}
/**
 * Executa todas as migrações pendentes
 */
export async function migrate(migrationsDir) {
    const dir = migrationsDir || path.join(__dirname, '../../../infra/migrations');
    if (!fs.existsSync(dir)) {
        console.error(`[MIGRATE] Migrations directory not found: ${dir}`);
        process.exit(1);
    }
    console.log('[MIGRATE] Starting migrations...');
    console.log(`[MIGRATE] Directory: ${dir}`);
    // Garante tabela de controle
    await ensureMigrationsTable();
    // Lista aplicadas
    const applied = await getAppliedMigrations();
    console.log(`[MIGRATE] Already applied: ${applied.length}`);
    // Lê arquivos
    const migrations = readMigrationFiles(dir);
    console.log(`[MIGRATE] Total migrations: ${migrations.length}`);
    // Aplica pendentes
    let appliedCount = 0;
    for (const migration of migrations) {
        if (!applied.includes(migration.filename)) {
            await applyMigration(migration);
            appliedCount++;
        }
    }
    if (appliedCount === 0) {
        console.log('[MIGRATE] No new migrations to apply');
    }
    else {
        console.log(`[MIGRATE] ✓ Applied ${appliedCount} new migration(s)`);
    }
}
/**
 * Reseta o banco (CUIDADO!)
 */
export async function reset() {
    console.log('[MIGRATE] ⚠️  RESETTING DATABASE...');
    console.log('[MIGRATE] This will DROP ALL TABLES');
    // Drop all tables
    await query(`
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO public;
  `);
    console.log('[MIGRATE] ✓ Database reset complete');
    console.log('[MIGRATE] Running migrations...');
    // Re-run migrations
    await migrate();
}
/**
 * Seed inicial
 */
export async function seed() {
    console.log('[SEED] Running seed...');
    // Criar vendedor padrão
    const seller = await query(`
    INSERT INTO sellers (name, email, active)
    VALUES ('Vendedor Padrão', 'vendedor@example.com', true)
    ON CONFLICT DO NOTHING
    RETURNING id
  `);
    if (seller.rows[0]) {
        console.log(`[SEED] ✓ Created default seller: ${seller.rows[0].id}`);
    }
    console.log('[SEED] ✓ Seed complete');
}
// CLI
if (process.argv[1].includes('migrate')) {
    const command = process.argv[2];
    (async () => {
        try {
            if (command === 'reset') {
                await reset();
            }
            else if (command === 'seed') {
                await seed();
            }
            else {
                await migrate();
            }
        }
        catch (error) {
            console.error('[MIGRATE] Error:', error);
            process.exit(1);
        }
        finally {
            await close();
        }
    })();
}
export default migrate;
//# sourceMappingURL=migrate.js.map