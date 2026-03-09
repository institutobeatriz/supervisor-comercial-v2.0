/**
 * Migration Runner
 * Supervisor Comercial
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, getPool, close } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Migration {
  filename: string;
  sql: string;
}

/**
 * Cria tabela de controle de migraÃ§Ãµes
 */
async function ensureMigrationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/**
 * Lista migraÃ§Ãµes jÃ¡ aplicadas
 */
async function getAppliedMigrations(): Promise<string[]> {
  const result = await query<{ filename: string }>(
    'SELECT filename FROM _migrations ORDER BY id'
  );
  return result.rows.map((r) => r.filename);
}

/**
 * LÃª arquivos de migraÃ§Ã£o
 */
function readMigrationFiles(migrationsDir: string): Migration[] {
  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  return files.map((filename) => ({
    filename,
    sql: fs.readFileSync(path.join(migrationsDir, filename), 'utf-8'),
  }));
}

/**
 * Aplica uma migraÃ§Ã£o
 */
async function applyMigration(migration: Migration): Promise<void> {
  console.log(`[MIGRATE] Applying: ${migration.filename}`);

  await query('BEGIN');
  try {
    await query(migration.sql);
    await query('INSERT INTO _migrations (filename) VALUES ($1)', [migration.filename]);
    await query('COMMIT');
    console.log(`[MIGRATE] âœ“ Applied: ${migration.filename}`);
  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }
}

/**
 * Executa todas as migraÃ§Ãµes pendentes
 */
export async function migrate(migrationsDir?: string): Promise<void> {
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

  // LÃª arquivos
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
  } else {
    console.log(`[MIGRATE] âœ“ Applied ${appliedCount} new migration(s)`);
  }
}

/**
 * Reseta o banco (CUIDADO!)
 */
export async function reset(): Promise<void> {
  console.log('[MIGRATE] âš ï¸  RESETTING DATABASE...');
  console.log('[MIGRATE] This will DROP ALL TABLES');

  // Drop all tables
  await query(`
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO public;
  `);

  console.log('[MIGRATE] âœ“ Database reset complete');
  console.log('[MIGRATE] Running migrations...');

  // Re-run migrations
  await migrate();
}

/**
 * Seed inicial
 */
export async function seed(): Promise<void> {
  console.log('[SEED] Running seed...');

  // Criar vendedor padrÃ£o
  const sellers = await query<{ id: string }>(`
    INSERT INTO sellers (name, email, active)
    VALUES ('Vendedor PadrÃ£o', 'vendedor@example.com', true)
    ON CONFLICT DO NOTHING
    RETURNING id
  `);

  if (sellers.rows.length > 0) {
    console.log(`[SEED] âœ“ Created default seller: ${sellers.rows[0].id}`);
  }

  console.log('[SEED] âœ“ Seed complete');
}

// CLI
if (process.argv[1] && process.argv[1].includes('migrate')) {
  const command = process.argv[2];

  (async () => {
    try {
      if (command === 'reset') {
        await reset();
      } else if (command === 'seed') {
        await seed();
      } else {
        await migrate();
      }
    } catch (error) {
      console.error('[MIGRATE] Error:', error);
      process.exit(1);
    } finally {
      await close();
    }
  })();
}

export default migrate;




