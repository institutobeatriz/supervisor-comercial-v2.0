import { request } from 'http';

const data = JSON.stringify({
  event: 'messages.upsert',
  instance: 'instituto-vendas',
  data: {
    key: {
      remoteJid: '5511999999999@s.whatsapp.net',
      fromMe: false,
      id: 'test-beatriz-001'
    },
    message: {
      conversation: 'Olá, quero saber mais sobre o curso de estética facial'
    },
    messageTimestamp: 1709041200,
    pushName: 'Cliente Teste Beatriz'
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
  });
});

req.on('error', (e) => console.error('Erro:', e.message));
req.write(data);
req.end();
