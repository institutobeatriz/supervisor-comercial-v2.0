# 17 - Fase 6 - Fechamento do Dashboard Comercial

## Data
- 2026-03-08 (America/Sao_Paulo)

## Objetivo da fase
Concluir o dashboard no frontend com foco em:
- remover hardcodes de ambiente;
- alinhar contratos reais da API com as telas;
- cobrir estados de loading, vazio, erro, sucesso e desabilitado;
- validar exportacoes PDF/XLSX com build real.

## Correcoes aplicadas
1. Camada HTTP unificada no dashboard
- novo arquivo `apps/dashboard/src/services/http.ts` com:
  - resolucao central de `VITE_API_BASE` (fallback `/api`);
  - `resolveApiPath()` para evitar drift de base URL;
  - `requestJson()` com parse seguro de erro HTTP.

2. Remocao de hardcodes de API base
- `apps/dashboard/src/hooks/useApi.ts`:
  - remove `http://localhost:3000/api`;
  - usa `requestJson()` e abort em unmount.
- `apps/dashboard/src/App.tsx`:
  - remove `API_BASE` hardcoded;
  - contador de alertas usa `requestJson('/alerts')`.
- `apps/dashboard/src/pages/Relatorios.tsx`:
  - remove `API_BASE` hardcoded;
  - exportacoes usam camada HTTP unificada.
- `apps/dashboard/src/services/api.ts`:
  - centralizado para `requestJson()`.

3. Ajustes de contratos tela x API
- `apps/dashboard/src/pages/FollowUp.tsx`:
  - corrigido contrato de `/api/dashboard/followup/full`;
  - tela agora consome `items` (antes: `conversations`);
  - `stats.total_pending` (antes: `stats.pending`).

4. Estados de tela reforcados
- `apps/dashboard/src/pages/Executivo.tsx`:
  - estados de loading/erro/vazio;
  - aviso de parcial quando um endpoint falha.
- `apps/dashboard/src/pages/Funil.tsx`:
  - estados de erro e vazio.
- `apps/dashboard/src/pages/LossAnalysis.tsx`:
  - estados de erro e vazio.
- `apps/dashboard/src/pages/MetricsIA.tsx`:
  - estados de erro e vazio.
- `apps/dashboard/src/pages/Conversas.tsx`:
  - estado de erro na lista;
  - retry manual;
  - detalhe da conversa com erro explicito.
- `apps/dashboard/src/pages/Alertas.tsx`:
  - fallback REST via camada HTTP unificada;
  - erro de stream exibido no header.

5. Estados desabilitados explicitos
- `apps/dashboard/src/pages/FollowUp.tsx`:
  - botoes de acao (mensagem/ligar) marcados como `disabled`.
- `apps/dashboard/src/pages/Conversas.tsx`:
  - botao de telefone marcado como `disabled`.
- `apps/dashboard/src/pages/Alertas.tsx`:
  - botoes de visualizar/ligar marcados como `disabled`.

6. Dependencias para exportacoes
- `apps/dashboard/package.json`:
  - adicionadas `jspdf`, `jspdf-autotable`, `xlsx`.

## Validacao tecnica executada
1. Build frontend do dashboard
```bash
npm install -w dashboard
npm run build -w dashboard
```
Resultado:
- build concluido com sucesso.
- sem erro de dependencia em `jspdf/jspdf-autotable/xlsx`.

2. Smoke de contratos API usados nas telas
Comando executado via Node local para endpoints chave:
- `/api/dashboard/kpis`
- `/api/dashboard/kpis-comparison`
- `/api/dashboard/funnel`
- `/api/dashboard/pipeline-weighted`
- `/api/dashboard/sellers/full`
- `/api/dashboard/products/comparison`
- `/api/dashboard/loss-stats`
- `/api/dashboard/followup/full`
- `/api/conversations`
- `/api/alerts`
- `/api/metrics/usage`

Resultado:
- todos com `HTTP 200`;
- chaves esperadas retornadas em todos os endpoints;
- divergencia de contrato em `followup/full` confirmada e corrigida no frontend (`items`).

## Evidencias de aceite da fase
1. Nao ha mais ocorrencias de `http://localhost:3000/api` no codigo de `apps/dashboard/src`.
2. Tela de Follow-up passa a consumir payload real do backend.
3. Exportacoes PDF/XLSX mantidas no build final.
4. Estados de erro/vazio cobertos nas telas principais do dashboard.

## Riscos residuais
1. Bundle principal e chunk de Relatorios seguem acima de 500kb (warning do Vite), sem bloqueio funcional.
2. Alguns botoes de acao foram explicitamente desabilitados por falta de fluxo operacional implementado (acao marcada para fase seguinte).

## Conclusao
Fase 6 concluida com fechamento funcional do dashboard no frontend:
- contratos alinhados com API real;
- hardcodes removidos;
- estados de interface padronizados nos modulos centrais;
- exportacoes validadas em build de producao.
