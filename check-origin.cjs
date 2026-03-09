const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function check() {
  // Verificar se mensagens são do WhatsApp real
  const sample = await pool.query(`
    SELECT 
      m.timestamp,
      m.direction,
      m.raw_event->>'key'->>'remoteJid' as telefone,
      m.raw_event->>'pushName' as nome
    FROM messages m
    WHERE m.raw_event IS NOT NULL
    ORDER BY m.timestamp DESC
    LIMIT 10
  `);
  
  console.log("=== ULTIMAS 10 MENSAGENS REAIS ===\n");
  sample.rows.forEach((r, i) => {
    const tel = r.telefone || '(sem telefone)';
    const nome = r.nome || '(sem nome)';
    console.log((i+1) + ". " + r.timestamp.toISOString());
    console.log("   Telefone: " + tel);
    console.log("   Nome: " + nome);
    console.log("   Direcao: " + r.direction);
    console.log("");
  });
  
  // Verificar se há vendas com valor real
  const realSales = await pool.query(`
    SELECT COUNT(*) as total, SUM(value_cents) as soma
    FROM sales_outcomes 
    WHERE value_cents > 0
  `);
  console.log("VENDAS COM VALOR REAL:");
  console.log("  Quantidade: " + realSales.rows[0].total);
  console.log("  Total: R$ " + (realSales.rows[0].soma/100 || 0));
  
  await pool.end();
}
check();
