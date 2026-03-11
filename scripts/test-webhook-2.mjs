import { request } from 'http';

const data = JSON.stringify({
  event: 'messages.upsert',
  instance: 'instituto-vendas',
  data: {
    key: {
      remoteJid: '5511888888888@s.whatsapp.net',
      fromMe: false,
      id: 'test-beatriz-002'
    },
    message: {
      conversation: 'Quero me matricular no curso de estética'
    },
    messageTimestamp: 1709041300,
    pushName: 'Aluna Teste'
  }
});

const req = request({
  hostname: 'localhost',
  port: 3000,
  path: '/webhooks/evolution',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Resposta:', body);
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error('Erro:', e.message);
  process.exit(1);
});

req.write(data);
req.end();
