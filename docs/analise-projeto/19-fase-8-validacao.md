# 19 - Fase 8 - Performance Frontend e Otimizacao de Bundle

## Data
- 2026-03-08 (America/Sao_Paulo)

## Objetivo da fase
Executar o primeiro backlog pos-Fase 7:
- reduzir o tamanho do bundle do dashboard;
- eliminar warning de chunk > 500kb;
- melhorar carregamento inicial mantendo comportamento funcional.

## Problema de origem
No fechamento da Fase 7 o build do dashboard ainda emitia warning de chunk > 500kb, com pacotes pesados (`recharts`, `jspdf`, `xlsx`) elevando custo do primeiro carregamento.

## Correcoes aplicadas
1. Quebra de dependencia circular de configuracao de produto
- Criado `apps/dashboard/src/config/products.ts` com `PRODUCTS` e tipo dedicado.
- Atualizado consumo em:
  - `apps/dashboard/src/App.tsx`
  - `apps/dashboard/src/pages/Funil.tsx`
  - `apps/dashboard/src/pages/Produtos.tsx`
  - `apps/dashboard/src/pages/Relatorios.tsx`
- Resultado: paginas deixaram de importar `PRODUCTS` via `App.tsx`, reduzindo acoplamento e favorecendo split de chunks.

2. Code splitting por pagina (abas)
- `apps/dashboard/src/App.tsx` alterado para lazy load de todas as paginas principais:
  - Executivo, Funil, Performance, Produtos, Perdas, Conversas, Follow-up, Reviews, Metrics IA, Alertas e Relatorios.
- `Suspense` unificado no conteudo principal com fallback de carregamento.
- Resultado: bundle inicial ficou significativamente menor e cada aba carrega sob demanda.

3. Carregamento sob demanda de libs pesadas de exportacao
- `apps/dashboard/src/pages/Relatorios.tsx`:
  - removidos imports estaticos de `jspdf`, `jspdf-autotable` e `xlsx`;
  - adicionados imports dinamicos (`import()`) apenas no momento da exportacao.
- Resultado: libs de exportacao deixaram de pesar no chunk da pagina no carregamento inicial.

4. Limpeza funcional
- Removida chamada redundante de `kpis` na exportacao PDF em `Relatorios.tsx` (variavel nao usada), reduzindo IO desnecessario.

## Validacao tecnica executada
1. Build dashboard
```bash
npm run build -w dashboard
```
Resultado:
- build concluido com sucesso;
- chunk principal dividido em multiplos chunks menores;
- sem warning de chunk > 500kb.

2. Lint global
```bash
npm run lint
```
Resultado:
- sucesso.

3. Typecheck global
```bash
npm run typecheck
```
Resultado:
- sucesso.

4. Build global workspace
```bash
npm run build
```
Resultado:
- sucesso em packages + apps.

## Evidencias de aceite da fase
1. Novo arquivo de configuracao compartilhada:
- `apps/dashboard/src/config/products.ts`.
2. `App.tsx` com lazy loading de paginas e fallback centralizado.
3. `Relatorios.tsx` com imports dinamicos de `jspdf/xlsx`.
4. Build sem warning de chunk > 500kb (antes havia warning recorrente na Fase 7).

## Riscos residuais
1. Ainda existem chunks pesados (ex.: `xlsx` e `jspdf`) por natureza das libs, mas agora carregados on-demand.
2. Evolucao futura de paginas deve manter disciplina de imports dinamicos para nao regressar tamanho do bundle inicial.

## Conclusao
Fase 8 concluida com foco em performance frontend:
- warning de bundle elevado removido;
- carregamento inicial do dashboard otimizado;
- arquitetura frontend mais modular para crescimento sustentavel.
