# Bug Fix: Webhook Schema Evolution API

## Problema

O webhook retornava **400 Bad Request** para ~50% das requisições da Evolution API.

## Causa Raiz

A Evolution API envia diferentes eventos com formatos distintos no campo `data`:

| Evento | Formato |
|--------|---------|
| `messages.upsert` | Objeto: `{ key: {...}, message: {...} }` |
| `chats.upsert` | Array: `[{ remoteJid: "...", name: "..." }]` |

O schema Zod só aceitava objeto:
```typescript
// ❌ ANTES - Quebrava com arrays
const WebhookPayloadSchema = z.object({
  event: z.string(),
  instance: z.string(),
  data: z.record(z.unknown())  // Só aceita objeto
});
```

## Solução

```typescript
// ✅ DEPOIS - Aceita objeto e array
const WebhookPayloadSchema = z.object({
  event: z.string(),
  instance: z.string(),
  data: z.union([z.record(z.unknown()), z.array(z.unknown())])
});
```

## Arquivo Modificado

`apps/api/src/routes/webhook.ts` - linha ~60

## Data

2026-03-03

## Lição

APIs de terceiros podem enviar formatos diferentes do esperado no mesmo campo. Sempre:
1. Logar payloads rejeitados para debug
2. Usar `z.union()` para campos com múltiplos formatos
3. Consultar documentação da API para entender todos os eventos
