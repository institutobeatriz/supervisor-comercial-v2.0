# Test Fixtures — Golden Dataset

Fixtures for evaluating classification pipeline precision/recall.

## Structure
- `conversations/` — WhatsApp conversation scenarios with expected classification outcomes
- `comprovantes/` — Payment receipt detection test cases

## Format
Each fixture is a JSON file with `messages[]` and `expected` fields.
Run `npx tsx scripts/eval-golden.ts` to evaluate against the LLM pipeline.

## Adding fixtures
Add a JSON file following the `conv_001_nova_venda.json` format.
Expected fields: `final_funnel_stage`, `outcome`, `sale_type`, `last_intent`, `has_objection`, `objection_type`.
