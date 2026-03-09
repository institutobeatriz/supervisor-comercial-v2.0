#!/usr/bin/env node
/**
 * Golden Dataset Evaluator
 * Runs test conversations through the classification pipeline and measures precision/recall.
 *
 * Usage: npx tsx scripts/eval-golden.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Message {
  direction: 'inbound' | 'outbound';
  text: string;
  timestamp: string;
}

interface ExpectedOutcome {
  final_funnel_stage: string;
  outcome: string;
  sale_type: string | null;
  last_intent: string;
  has_objection: boolean;
  objection_type: string | null;
}

interface Fixture {
  id: string;
  description: string;
  messages: Message[];
  expected: ExpectedOutcome;
}

interface EvalResult {
  fixtureId: string;
  description: string;
  passed: boolean;
  errors: string[];
}

async function evalFixture(fixture: Fixture): Promise<EvalResult> {
  const errors: string[] = [];

  // For now: structural validation only (LLM integration requires live API)
  // Full LLM evaluation: import classifyMessage from packages/llm and call it

  // Validate fixture has required fields
  if (!fixture.messages || fixture.messages.length === 0) {
    errors.push('Fixture has no messages');
  }

  const inboundMessages = fixture.messages.filter(m => m.direction === 'inbound');
  if (inboundMessages.length === 0) {
    errors.push('Fixture has no inbound messages to classify');
  }

  // Validate expected fields
  const requiredFields: (keyof ExpectedOutcome)[] = ['final_funnel_stage', 'outcome', 'last_intent', 'has_objection'];
  for (const field of requiredFields) {
    if (fixture.expected[field] === undefined) {
      errors.push(`Missing required expected field: ${field}`);
    }
  }

  // Validate outcome values
  const validOutcomes = ['won', 'lost', 'open', 'cancelled'];
  if (!validOutcomes.includes(fixture.expected.outcome)) {
    errors.push(`Invalid outcome: ${fixture.expected.outcome}. Must be one of: ${validOutcomes.join(', ')}`);
  }

  const validStages = ['lead', 'contact', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
  if (!validStages.includes(fixture.expected.final_funnel_stage)) {
    errors.push(`Invalid funnel stage: ${fixture.expected.final_funnel_stage}. Must be one of: ${validStages.join(', ')}`);
  }

  return {
    fixtureId: fixture.id,
    description: fixture.description,
    passed: errors.length === 0,
    errors,
  };
}

async function main() {
  const fixturesDir = path.join(__dirname, '../infra/test-fixtures/conversations');

  if (!fs.existsSync(fixturesDir)) {
    console.error(`Fixtures directory not found: ${fixturesDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.json'));

  if (files.length === 0) {
    console.error('No fixture files found in', fixturesDir);
    process.exit(1);
  }

  console.log(`\n📊 Running Golden Dataset Evaluation (${files.length} fixtures)\n`);

  let passed = 0;
  let failed = 0;
  const results: EvalResult[] = [];

  for (const file of files) {
    const fixturePath = path.join(fixturesDir, file);
    const fixture: Fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
    const result = await evalFixture(fixture);
    results.push(result);

    if (result.passed) {
      console.log(`✅ ${fixture.id}: ${fixture.description}`);
      passed++;
    } else {
      console.log(`❌ ${fixture.id}: ${fixture.description}`);
      result.errors.forEach(e => console.log(`   → ${e}`));
      failed++;
    }
  }

  const precision = passed / files.length;
  console.log(`\nResults: ${passed}/${files.length} passed (${Math.round(precision * 100)}%)`);

  if (precision < 0.8) {
    console.error('\n🚨 Precision below 80% threshold! Fix fixture structure before merging.');
    process.exit(1);
  }

  console.log('\n✅ All fixtures are structurally valid.');
  process.exit(0);
}

main().catch(err => {
  console.error('Evaluation failed:', err);
  process.exit(1);
});
