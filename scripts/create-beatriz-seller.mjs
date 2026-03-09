/**
 * Script para criar seller Instituto Beatriz Oliveira
 */

import { query } from '@supervisor/db';

async function createBeatrizSeller() {
  console.log('=== Criando seller: Instituto Beatriz Oliveira ===\n');
  
  // Verificar se já existe
  const existing = await query(
    'SELECT id FROM sellers WHERE name ILIKE $1',
    ['%Beatriz%']
  );
  
  if (existing.rows.length > 0) {
    console.log('✓ Seller já existe:', existing.rows[0].id);
    return existing.rows[0].id;
  }
  
  // Criar novo seller
  const result = await query(
    `INSERT INTO sellers (name, active) 
     VALUES ($1, true) 
     RETURNING id`,
    ['Instituto Beatriz Oliveira']
  );
  
  const sellerId = result.rows[0].id;
  console.log('✓ Seller criado:', sellerId);
  
  return sellerId;
}

createBeatrizSeller().catch(console.error);
