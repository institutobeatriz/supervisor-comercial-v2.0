import { query } from '@supervisor/db';

async function listSellers() {
  const result = await query('SELECT id, name, active FROM sellers ORDER BY name');
  console.log('=== SELLERS ===\n');
  for (const s of result.rows) {
    console.log(`ID: ${s.id}`);
    console.log(`Nome: ${s.name}`);
    console.log(`Ativo: ${s.active}`);
    console.log('---');
  }
}

listSellers().catch(console.error);
