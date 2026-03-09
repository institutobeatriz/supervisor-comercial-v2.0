# 20 - Fase 9 - Hardening de Dependencias

## Data
- 2026-03-08 (America/Sao_Paulo)

## Objetivo da fase
Executar hardening de dependencias apos Fase 8 para reduzir superficie de risco:
- remover CVEs criticas/moderadas/high do dashboard;
- garantir lockfile coerente com versoes corrigidas;
- validar pipeline de qualidade (`lint`, `typecheck`, `build`).

## Problema de origem
Linha de base de auditoria apontava:
1. `fastify` (high) na arvore do backend.
2. `jspdf` (critical), `jspdf-autotable` (high) e `dompurify` (moderate via `jspdf`) no dashboard.
3. `xlsx` (high) sem patch disponivel no feed do `npm audit`.

## Correcoes aplicadas
1. Backend (API)
- `apps/api/package.json`
  - `fastify`: `^4.26.2` -> `^5.8.2`
  - `@fastify/cors`: `^9.0.1` -> `^11.2.0`
  - `@fastify/helmet`: `^11.1.1` -> `^13.0.2`

2. Dashboard (deps)
- `apps/dashboard/package.json`
  - `jspdf`: `^2.5.2` -> `^4.2.0`
  - `jspdf-autotable`: `^3.8.4` -> `^5.0.7`
  - removido `xlsx`
  - adicionado `exceljs@^4.4.0`

3. Dashboard (codigo de exportacao)
- `apps/dashboard/src/pages/Relatorios.tsx`
  - migrado fluxo de exportacao XLSX para `exceljs`;
  - mantidas abas e colunas dos dois relatorios de Excel;
  - download local via `Blob` + URL temporaria;
  - imports seguem dinamicos (`import()`) para nao carregar libs pesadas no primeiro paint.

4. Lock e resolucao transiente
- `package.json` recebeu:
  - `"overrides": { "jspdf": "^4.2.0" }`
- lock realinhado com:
  - `npm install`
  - `npm install -w dashboard jspdf@4.2.0 jspdf-autotable@5.0.7 --force`
- evidenciado por `npm ls jspdf --all` com apenas `jspdf@4.2.0` no dashboard.

5. Correcao colateral de typecheck (Fastify v5)
- `apps/api/src/index.ts`
  - error handler global ajustado com narrowing de `FastifyError`;
  - evita acesso inseguro em `error` tipado como `unknown`.

## Validacao tecnica executada
1. Auditoria de seguranca
```bash
npm audit --json
npm audit -w dashboard --json
```
Resultado:
- root: apenas `pm2` low residual (sem fix disponivel).
- dashboard: `0` vulnerabilidades.

2. Cadeia de versoes critica
```bash
npm ls jspdf --all
```
Resultado:
- `jspdf@4.2.0` unico na arvore do dashboard.

3. Qualidade e build
```bash
npm run lint
npm run typecheck
npm run build
```
Resultado:
- todos os comandos com sucesso.

## Evidencias
1. `audit-root.json`
2. `audit-dashboard.json`
3. `apps/dashboard/package.json`
4. `apps/dashboard/src/pages/Relatorios.tsx`
5. `apps/api/src/index.ts`
6. `package.json` e `package-lock.json`

## Riscos residuais
1. `pm2` permanece com vuln low (GHSA-x5gf-qvw8-r2rm) e `fixAvailable: false`.
2. Build do dashboard volta a emitir warning de chunk > 500kb por `exceljs.min`:
- risco funcional baixo porque o chunk e carregado apenas sob demanda na pagina de relatorios.

## Conclusao
Fase 9 concluida:
1. CVEs criticas/high do dashboard removidas.
2. `audit` do dashboard zerado.
3. pipeline de qualidade global validada.
4. projeto liberado para a proxima fase de operacao: monitoramento externo centralizado e SLOs.
