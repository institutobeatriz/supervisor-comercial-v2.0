# Transcrição de Áudio (STT) - Resolução

**Status:** ✅ RESOLVIDO em 2026-03-03

## Problema Original
O sistema não conseguia transcrever áudios do WhatsApp porque:
1. O áudio chegava criptografado (`.enc`) do WhatsApp
2. O webhook não passava a `mediaKey` corretamente para o worker
3. A descriptografia local via HKDF estava com bugs
4. O Groq rejeitava o formato do áudio (Content-Type incorreto)

## Solução Implementada

### 1. Webhook (apps/api)
- **Endpoint Evolution API:** Usamos `/chat/getBase64FromMediaMessage/{instance}` para baixar o áudio já descriptografado
- **Fallback:** Se a Evolution API falhar, usa descriptografia local com `mediaKey`
- **Fila STT:** Envia job para processamento com base64

### 2. Worker (apps/worker)
- **Blob com Content-Type:** Corrigimos para passar o tipo MIME correto (`audio/ogg`)
- **Extensão:** Determina `.ogg`, `.webm`, `.mp3` baseado no mimeType

### 3. Provedor STT
**Anterior:** Groq (`whisper-large-v3-turbo`)
**Atual:** **OpenAI Whisper-1** ✅

| Configuração | Valor |
|--------------|-------|
| Provedor | OpenAI |
| Modelo | `whisper-1` |
| Endpoint | `https://api.openai.com/v1` |
| API Key | `sk-proj-rFv6ELWi...` (mesma dos embeddings) |

## Resultado
- ✅ Transcrição em 1-3 segundos
- ✅ Qualidade superior ao Groq
- ✅ Formato OGG reconhecido corretamente
- ✅ Funcionando em produção desde 2026-03-03

## Exemplo de Transcrição
```
"Eu vou te dar um exemplo. Eu mesma acho mais fácil, amiga, contornar a 
objeção quando eu tô no telefone do que pelo WhatsApp..."
```

## Arquivos Modificados
- `apps/api/src/routes/webhook.ts` - Download via Evolution API
- `packages/stt/src/index.ts` - Content-Type correto + OpenAI

---
*Atualizado em: 2026-03-03*
