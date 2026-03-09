# Evolution API Events

Documentação dos eventos recebidos via webhook e seu mapeamento.

## Eventos Suportados

| Evento | Descrição | Processado |
|--------|-----------|------------|
| `messages.upsert` | Nova mensagem recebida | ✅ |
| `messages.upsert.api` | Mensagem via API | ✅ |
| `send.message` | Mensagem enviada | ✅ |
| `messages.update` | Atualização de status | ✅ |
| `connection.update` | Status de conexão | ✅ |
| `status.instance` | Status da instância | ✅ |

## Payloads de Exemplo

### 1. messages.upsert (Mensagem de Texto)

```json
{
  "event": "messages.upsert",
  "instance": "minha-instancia",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0ABC1234567890"
    },
    "message": {
      "conversation": "Olá, quero saber sobre o produto X"
    },
    "messageTimestamp": 1700000000,
    "pushName": "João Silva"
  }
}
```

**Mapeamento:**
| Campo Evolution | Campo Normalizado |
|-----------------|-------------------|
| `key.id` | `message_id` |
| `key.remoteJid` | `remote_jid` |
| `key.fromMe` | `direction` (true = outbound) |
| `message.conversation` | `text` |
| `messageTimestamp` | `timestamp` |
| `pushName` | `push_name` |

### 2. messages.upsert (Áudio)

```json
{
  "event": "messages.upsert",
  "instance": "minha-instancia",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0ABC1234567890"
    },
    "message": {
      "audioMessage": {
        "url": "https://mmg.whatsapp.net/o1/v/...",
        "mimetype": "audio/ogg",
        "fileLength": "12345",
        "seconds": 15,
        "ptt": true
      }
    },
    "messageTimestamp": 1700000000,
    "pushName": "João Silva"
  }
}
```

**Mapeamento:**
| Campo Evolution | Campo Normalizado |
|-----------------|-------------------|
| `message.audioMessage.url` | `media_url` |
| `message.audioMessage.mimetype` | `media_mime` |
| `message.audioMessage.fileLength` | `media_size` |
| `message.audioMessage.seconds` | `duration` (em transcrição) |
| `message.audioMessage.ptt` | É voice note |

### 3. messages.upsert (Imagem)

```json
{
  "event": "messages.upsert",
  "instance": "minha-instancia",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0ABC1234567890"
    },
    "message": {
      "imageMessage": {
        "url": "https://mmg.whatsapp.net/v/...",
        "mimetype": "image/jpeg",
        "fileLength": "45678",
        "caption": "Foto do produto"
      }
    },
    "messageTimestamp": 1700000000
  }
}
```

### 4. messages.upsert (Documento)

```json
{
  "event": "messages.upsert",
  "instance": "minha-instancia",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0ABC1234567890"
    },
    "message": {
      "documentMessage": {
        "url": "https://mmg.whatsapp.net/v/...",
        "mimetype": "application/pdf",
        "fileName": "orcamento.pdf",
        "fileLength": "123456"
      }
    },
    "messageTimestamp": 1700000000
  }
}
```

### 5. messages.upsert (Resposta/Quote)

```json
{
  "event": "messages.upsert",
  "instance": "minha-instancia",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0ABC1234567890"
    },
    "message": {
      "extendedTextMessage": {
        "text": "Sim, concordo!",
        "contextInfo": {
          "stanzaId": "3EB0PREVIOUS123",
          "quotedMessage": {
            "conversation": "Você concorda com o prazo?"
          }
        }
      }
    },
    "messageTimestamp": 1700000000
  }
}
```

**Mapeamento:**
| Campo Evolution | Campo Normalizado |
|-----------------|-------------------|
| `extendedTextMessage.text` | `text` |
| `contextInfo.stanzaId` | `quoted_id` |

### 6. messages.update (Status de Mensagem)

```json
{
  "event": "messages.update",
  "instance": "minha-instancia",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": true,
      "id": "3EB0ABC1234567890"
    },
    "status": "delivered",
    "messageTimestamp": 1700000100
  }
}
```

**Status possíveis:**
- `pending` - Enviando
- `sent` - Enviada
- `delivered` - Entregue
- `read` - Lida
- `failed` - Falhou

### 7. connection.update (Status de Conexão)

```json
{
  "event": "connection.update",
  "instance": "minha-instancia",
  "data": {
    "state": "connected",
    "ownerJid": "5511999999999@s.whatsapp.net",
    "profileName": "Minha Empresa"
  }
}
```

**Estados possíveis:**
- `connecting` - Conectando
- `connected` - Conectado
- `disconnected` - Desconectado
- `error` - Erro

## Tipo de Mensagem

O normalizador determina o `type` baseado nos campos presentes:

| Campo no message | type |
|------------------|------|
| `conversation` ou `extendedTextMessage` | `text` |
| `imageMessage` | `image` |
| `videoMessage` | `video` |
| `audioMessage` | `audio` |
| `documentMessage` | `document` |
| `stickerMessage` | `sticker` |
| `locationMessage` | `location` |
| `contactMessage` | `contact` |
| `reactionMessage` | `reaction` |
| Outros | `unknown` |

## Direção da Mensagem

- `fromMe: true` → `direction: "outbound"` (vendedor)
- `fromMe: false` → `direction: "inbound"` (cliente)

## Tratamento de Erros

O normalizador é tolerante a variações no payload:

- Campos opcionais retornam `null` se ausentes
- Tipos desconhecidos são marcados como `unknown`
- Timestamps podem vir como número ou string
- `fileLength` pode ser string ou número

## Testando

```bash
# Teste local com payload fake
curl -X POST http://localhost:3000/webhooks/evolution \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages.upsert",
    "instance": "test",
    "data": {
      "key": {
        "remoteJid": "5511999999999@s.whatsapp.net",
        "fromMe": false,
        "id": "test-123"
      },
      "message": {
        "conversation": "Teste de mensagem"
      },
      "messageTimestamp": 1700000000,
      "pushName": "Teste"
    }
  }'
```

## Referência

- [Evolution API Docs](https://doc.evolution-api.com/)
- [WhatsApp Web Protocol](https://github.com/sigalor/whatsapp-web-reveng)
