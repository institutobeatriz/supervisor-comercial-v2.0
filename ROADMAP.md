# ROADMAP — Supervisor Comercial Dashboard
> Documento de controle de progresso. Atualizar a cada sessão de trabalho.
> Última atualização: 2026-03-05

---

## ESTADO ATUAL DO PROJETO

### Stack
- **API:** Fastify + TypeScript (porta 3000)
- **Worker:** BullMQ + Redis (lanes: fast/slow/critical/stt)
- **DB:** PostgreSQL + pgvector
- **STT:** Groq Whisper
- **LLM:** GLM-5 → Kimi → DeepSeek → Opus (fallback chain)
- **Frontend:** React + Vite + Tailwind (porta 5173)
- **Modo:** Shadow monitoring — só observa, nunca envia mensagens

### Instâncias/Produtos Ativos
| UUID | Label atual | Produto real |
|------|-------------|--------------|
| `80a50431-8f36-477c-9072-f0adcba3696e` | Vendedor Padrão | *(a definir)* |
| `6f875432-5dea-4fcf-972e-b278eb2c1d5b` | Instituto-Vendas | *(a definir)* |

---

## STATUS DAS ABAS DO DASHBOARD

| Aba | API conectada | Dados reais | Observações |
|-----|:---:|:---:|-------------|
| Visão Executiva | ✅ | ✅ | KPIs + forecast + comparativo + evolução + pipeline |
| Funil Comercial | ✅ | ✅ | Temperatura quente/morno/frio + estágios + estatísticas |
| Performance | ✅ | ✅ | Ranking ajustado, funil individual, evolução semanal, melhores horários |
| Produtos | ✅ | ✅ | Comparativo, radar, metas, objeções, reativação, sensibilidade a preço |
| Análise de Perdas | ✅ | ✅ | Perdas por estágio, objeções, motivos — filtro período |
| Conversas | ✅ | ✅ | Busca, filtros de estágio, paginação, painel slide-in com timeline |
| Follow-up | ✅ | ✅ | Categorias crítico/atrasado/normal — filtro período |
| Revisões | ✅ | ✅ | Aprovação/rejeição funcional com feedback inline |
| Métricas IA | ✅ | ✅ | Tokens, custo, chamadas por modelo |
| Alertas | ✅ | ✅ | SSE ao vivo, 7 tipos de alerta, badge, reconnect automático |
| Relatórios | ✅ | ✅ | PDF produtos, Excel vendedores (4 abas), Excel comparativo |

---

## ROADMAP DE MELHORIAS

### ✅ FASE 1 — Quick Wins (conectar mocks, base de produto)
> **Sessão 1 — 2026-03-04** — CONCLUÍDA

- [x] Criar este documento de planejamento
- [x] **1.1** Conectar Follow-up à API real — categorias crítico/atrasado/normal, urgência visual
- [x] **1.2** Conectar Alertas à API real — badge ao vivo na sidebar, refresh a cada 1min, botão dispensar
- [x] **1.3** Conectar Revisões à API real — aprovação/rejeição funcional com feedback inline
- [x] **1.4** Identidade de Produto — objeto PRODUCTS em App.tsx, emoji + cor por produto, filtro na sidebar, barra de meta colorida

---

### ✅ FASE 2 — Visão Executiva Poderosa
> **Sessão 2 — 2026-03-04** — CONCLUÍDA

- [x] **2.1** Projeção de fechamento do mês — barra dupla atual/projetado, alerta de ritmo, frase "meta será superada"
- [x] **2.2** Comparativo mês atual vs mês anterior — variação % com seta verde/vermelha em todos os KPIs
- [x] **2.3** Gráfico de evolução diária — AreaChart leads×vendas + BarChart faturamento (30 dias)
- [x] **2.4** Pipeline com valor ponderado — probabilidade por estágio, barra dupla bruto vs esperado, total ponderado
- [x] Criada página `Executivo.tsx` dedicada (App.tsx simplificado)
- [x] Endpoints novos: `/dashboard/kpis-comparison` e `/dashboard/pipeline-weighted`

---

### ✅ FASE 3 — Performance & Análise de Vendedores
> **Sessão 3 — 2026-03-04** — CONCLUÍDA

- [x] **3.1** Funil individual por vendedor (barras de conversão Lead→Qual→Prop→Fech→Fechado)
- [x] **3.2** Tempo médio de cada estágio do funil (dias médios em lead, qualificação, proposta, fechamento)
- [x] **3.3** Ranking ajustado pela qualidade dos leads recebidos (`conversion_rate × globalAvgQuality / sellerAvgQuality`)
- [x] **3.4** Evolução semanal por vendedor (AreaChart últimas 4 semanas + indicador ↑↓→ no ranking)
- [x] **3.5** Top 3 melhores horários de fechamento por vendedor (últimos 90 dias)
- [x] Endpoint novo: `/dashboard/sellers/full` com 5 queries paralelas
- [x] `Performance.tsx` completamente reescrito — painel expansível por vendedor, 3 modos de ranking (faturamento/conversão/ajustado)

---

### ✅ FASE 4 — Análise por Produto
> **Sessão 4 — 2026-03-04** — CONCLUÍDA

- [x] **4.1** Visão comparativa entre produtos — cards com leads, conversão, faturamento, % do total
- [x] **4.2** Objeções por produto — top 3 objeções por instância (últimos 30 dias)
- [x] **4.3** Sensibilidade a preço por produto — detectada via `message_labels.objection/intent`
- [x] **4.4** Taxa de reativação por produto — contatos que voltaram após conversa anterior
- [x] **4.5** Metas individuais por produto — barra de progresso com cor por status (verde/amarelo/vermelho)
- [x] Endpoint novo: `/dashboard/products/comparison` com 5 queries paralelas
- [x] Página nova `Produtos.tsx` com: cards por produto, gráfico comparativo de barras, radar comparativo (quando 2+ produtos)
- [x] Nova aba "Produtos" adicionada ao menu lateral

---

### ✅ FASE 5 — Alertas Inteligentes em Tempo Real
> **Sessão 5 — 2026-03-04** — CONCLUÍDA

- [x] **5.1** Alertas já eram reais — refatorados em `buildAlerts()` reutilizável (REST + SSE)
- [x] **5.2** Lead quente sem resposta (quality_score ≥ 80, última msg inbound >30min) → urgente
- [x] **5.3** Lead de alto valor estagnado em proposta/fechamento por 3+ dias → alerta
- [x] **5.4** Vendedor abaixo de 70% do ritmo esperado (qualquer dia após o dia 5) → info/urgente
- [x] **5.5** Queda >30% na conversão semanal vs semana anterior → info estratégico
- [x] **5.6** SSE (Server-Sent Events) em `/api/alerts/stream` — push a cada 30s + keepalive 15s
- [x] `Alertas.tsx` reescrito com hook `useAlertStream` (EventSource + reconnect automático)
- [x] Indicador "🟢 Ao vivo" / "🔴 Reconectando" com badge "+N novos" quando urgentes aumentam
- [x] `vite.config.ts` atualizado com proxy SSE sem buffering (`X-Accel-Buffering: no`)
- [x] Fallback REST automático se SSE não conectar em 5 segundos

---

### ✅ FASE 6 — Relatórios Exportáveis
> **Sessão 6 — 2026-03-04** — CONCLUÍDA

- [x] **6.1** PDF por produto — cabeçalho, KPIs consolidados, tabela por produto, objeções, rodapé com paginação
- [x] **6.2** Excel por vendedor — 4 abas: Ranking, Funil, Tempo por Estágio, Melhores Horários
- [x] **6.3** Excel comparativo mês a mês — variações ▲▼→, histórico dos últimos 3 meses
- [x] Página `Relatorios.tsx` com 3 cards de exportação, estados de loading/sucesso/erro
- [x] Nova aba "Relatórios" no menu lateral (ícone FileDown)
- [x] Bibliotecas `jspdf`, `jspdf-autotable` e `xlsx` já instaladas no projeto

---

### ✅ FASE 7 — Melhorias de UX e Polimento
> **Sessão 7 — 2026-03-04** — CONCLUÍDA

- [x] **7.1** Fix bug `kpis` em App.tsx (variável removida na Fase 2, ainda referenciada na linha 115)
- [x] **7.2** Filtro de período propagado para TODAS as abas — `selectedProduct`, `periodMode`, `selectedDate`, `selectedMonth` passados como props para Performance, Produtos, LossAnalysis, FollowUp, Reviews, MetricsIA, Conversas
- [x] **7.3** Backend de conversas reescrito — suporte a `search` (nome/telefone/vendedor), `stage` filter, `limit`/`offset` (paginação), `periodMode`/`date`/`month`, retorna `total` real para paginação
- [x] **7.4** Endpoint novo `/conversations/:id` — detalhe completo com timeline de mensagens, sentiment, purchase_intent, estatísticas de classificação
- [x] **7.4** `Conversas.tsx` completamente reescrito:
  - Busca em tempo real com debounce 350ms
  - Filtros de estágio por pills (Todos/Novo/Lead/Qualificação/Proposta/Fechamento/Pós-Venda)
  - Paginação com janela de 5 páginas + total exibido
  - Cards com: temperatura 🔥🌡️❄️, score de qualidade, ícone de urgência, outcome ganho/perdido
  - Painel slide-in ao clicar na conversa: timeline de mensagens (bolhas estilo chat), métricas por conversa, sentiment por mensagem, purchase_intent
- [x] **7.5** Tema dinâmico por produto — CSS variable `--color-accent-primary` atualizada via `useEffect` no App.tsx ao trocar produto

---

## DECISÕES TÉCNICAS

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| STT | Groq only | Proibido usar Groq para chat |
| LLM Chat | NUNCA Groq/Ollama | GLM-5 como primário, fallbacks configurados |
| Embeddings | Provider separado (OpenAI-compatible) | Nunca Groq para embeddings |
| Timezone | America/Sao_Paulo (GMT-3) | Todo o sistema |
| Premium LLM | Opus/GPT — uso controlado | Só para relatórios e won/lost |

---

## PROBLEMAS CONHECIDOS

| Problema | Local | Status |
|---------|-------|--------|
| Instâncias hardcoded por UUID no App.tsx | `apps/dashboard/src/App.tsx` linha 77-78 | ⏳ Fase 1.4 |
| Follow-up com dados mock | `apps/dashboard/src/pages/FollowUp.tsx` | ⏳ Fase 1.1 |
| Alertas com dados mock | `apps/dashboard/src/pages/Alertas.tsx` | ⏳ Fase 1.2 |
| Revisões com dados mock | `apps/dashboard/src/pages/Reviews.tsx` | ⏳ Fase 1.3 |
| meta_mensal hardcoded (R$50.000) | `apps/api/src/routes/dashboard.ts` linha 62 | ⏳ Fase 2 |
| avg_first_response_min hardcoded (15) | `apps/api/src/routes/dashboard.ts` linha 521 | ⏳ Fase 3 |

---

## LOG DE SESSÕES

### Sessão 1 — 2026-03-04 ✅
- Análise completa do projeto (todas as abas, rotas da API, estrutura)
- Criado este documento ROADMAP.md
- Fase 1 concluída integralmente:
  - Follow-up conectado à API real com categorias urgência (crítico/atrasado/normal)
  - Alertas conectados à API real com badge ao vivo na sidebar + auto-refresh 1min
  - Revisões conectadas à API real com aprovação/rejeição funcional
  - Identidade de Produto implementada (objeto PRODUCTS configurável, emoji, cor, filtro)
  - useApi.ts atualizado para suportar headers customizados + apiPost helper
  - Barra de progresso de meta com cor dinâmica (verde/amarelo/vermelho)
- Próxima sessão: Fase 2 — Visão Executiva com Forecast e Comparativo

### Sessão 2 — 2026-03-04 ✅
- Fase 2 concluída integralmente:
  - Endpoint `/dashboard/kpis-comparison` — KPIs atual vs mês anterior com variação %
  - Endpoint `/dashboard/pipeline-weighted` — valor por estágio × probabilidade de fechamento
  - Página `Executivo.tsx` criada do zero com: KPIs + chips de variação, forecast com barra dupla e alerta de ritmo, comparativo vs mês anterior, gráfico AreaChart leads/vendas + BarChart faturamento, pipeline visual com barras duplas (bruto vs ponderado)
  - App.tsx simplificado — executivo agora delega para Executivo.tsx

### Sessão 3 — 2026-03-04 ✅
- Fase 3 concluída integralmente:
  - Endpoint `/dashboard/sellers/full` — 5 queries SQL: funil por vendedor, tempo por estágio, evolução semanal (4 semanas), melhores horários (90 dias), ranking ajustado por qualidade
  - `Performance.tsx` reescrito do zero:
    - KPIs do time (leads, conversões, faturamento, qualidade média)
    - Ranking com 3 modos: Faturamento / Conversão / Ajustado (com indicador ▲▼ vs rank original)
    - Indicador de tendência semanal (↑↓→) ao lado do nome
    - Painel expansível por clique com: funil individual (barras coloridas), tempo médio por estágio, gráfico AreaChart de evolução semanal, top 3 horários de fechamento
### Sessão 4 — 2026-03-04 ✅
- Fase 4 concluída integralmente:
  - Endpoint `/dashboard/products/comparison` — 5 queries: KPIs por produto, objeções, sensibilidade a preço, reativação, motivos de perda
  - Página `Produtos.tsx` criada do zero com: totais consolidados, gráfico de barras comparativo (3 métricas), radar comparativo, cards expansíveis por produto (meta, objeções, perdas)

### Sessão 5 — 2026-03-04 ✅
- Fase 5 concluída integralmente:
  - `alerts.ts` reescrito: função `buildAlerts()` central com 7 tipos de alerta inteligentes
  - Novos alertas: lead estagnado em proposta/fechamento, vendedor fora do ritmo da meta, queda de conversão semanal
  - Endpoint SSE `/api/alerts/stream` — conexão persistente, push 30s, keepalive 15s
  - `Alertas.tsx` reescrito com hook `useAlertStream` (EventSource, reconnect exponencial, fallback REST)
  - Indicador visual de conexão ao vivo + badge "+N novos alertas"
  - `vite.config.ts` atualizado para proxy SSE sem buffering

### Sessão 6 — 2026-03-04 ✅
- Fase 6 concluída integralmente:
  - Instaladas `jspdf`, `jspdf-autotable`, `xlsx` no projeto
  - `Relatorios.tsx` criado: 3 exports (PDF produtos, Excel vendedores, Excel comparativo)
  - PDF com capa, KPIs, tabelas formatadas, paginação automática via autoTable
  - Excel com múltiplas abas, variações ▲▼→, histórico 3 meses
  - Nova aba "Relatórios" adicionada ao menu lateral (ícone FileDown)

### Sessão 7 — 2026-03-04 ✅
- Fase 7 concluída integralmente:
  - Fix bug crítico em App.tsx: referência a `kpis` undefined removida
  - CSS variable `--color-accent-primary` injetada dinamicamente ao trocar produto (tema por instância)
  - Filtros de período (`periodMode`, `selectedDate`, `selectedMonth`, `selectedProduct`) propagados para todas as páginas via props
  - `conversations.ts` reescrito: busca fulltext, filtro de estágio, paginação com total real, endpoint `/conversations/:id` com timeline de mensagens
  - `Conversas.tsx` completamente reescrito: busca com debounce, pills de estágio, paginação com janela de páginas, cards ricos (temperatura/score/urgência), painel slide-in com timeline de mensagens, sentiment e purchase_intent por mensagem
- **TODAS AS 7 FASES CONCLUÍDAS** 🎉

---

### ✅ FASE 8 — Build Fixes e Polimento de Código
> **Sessão 8 — 2026-03-05** — CONCLUÍDA

- [x] **Build fix** — `vite.config.ts` atualizado com plugin `stub-core-js` que resolve o erro de build causado pelo `canvg` (dependência do `jspdf`) importar `core-js` não instalado
- [x] **8.1** Code splitting — `Relatorios.tsx` convertido para lazy import com `React.lazy()` + `Suspense`; bundle principal caiu de **1.428 kB → 707 kB** (50% menor), Relatorios carrega isolado (~714 kB) apenas quando acessado
- [x] **8.2** Extração do Funil Comercial — código inline do `App.tsx` movido para `Funil.tsx` componente próprio, mantendo o padrão de todas as outras páginas; `App.tsx` 60 linhas mais curto
- [x] **8.3** TypeScript fix — removido `(item as any).badge` na sidebar; adicionada interface `TabItem` com `badge?: number`; acesso direto `item.badge` agora type-safe

---

### Sessão 8 — 2026-03-05 ✅
- Fix de build: plugin Vite `stub-core-js` resolve conflito `canvg` → `core-js` sem instalar dependência extra
- Build 100% limpo em todos os pacotes do monorepo
- Code splitting: `lazy(() => import('./pages/Relatorios'))` + `Suspense` — initial bundle 50% menor
- `Funil.tsx` extraído (115 linhas) — App.tsx reduzido de ~385 para ~325 linhas
- `TabItem` interface tipada — badge sem `as any`

---

## STATUS FINAL

| Aba | Status | Destaque |
|-----|:------:|----------|
| Visão Executiva | ✅ | KPIs + forecast + comparativo + evolução + pipeline |
| Funil Comercial | ✅ | Temperatura quente/morno/frio + estágios + estatísticas |
| Performance | ✅ | Ranking ajustado, funil individual, evolução semanal, melhores horários |
| Produtos | ✅ | Comparativo, radar, metas, objeções, reativação |
| Análise de Perdas | ✅ | Perdas por estágio, objeções, motivos |
| Conversas | ✅ | Busca, filtros, paginação, timeline slide-in |
| Follow-up | ✅ | Categorias urgência, contatos críticos/atrasados |
| Revisões | ✅ | Aprovação/rejeição com feedback inline |
| Métricas IA | ✅ | Tokens, custo por modelo, evolução diária |
| Alertas | ✅ | SSE ao vivo, badge, 7 tipos de alerta inteligentes |
| Relatórios | ✅ | PDF produtos, Excel vendedores, Excel comparativo |

*Próxima sessão: consulte este arquivo primeiro para saber onde parou.*
