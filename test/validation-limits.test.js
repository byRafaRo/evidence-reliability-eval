import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../src/evaluate.js';
import { freshQuote, response } from '../fixtures/cases.js';

test('quantity accepts its maximum and rejects the next integer without clipping', () => {
  for (const [quantity, total, errors, requiredOutcome] of [
    [1_000_000, '10000.00', [], 'answer'],
    [1_000_001, '10000.01', ['invalid_evidence'], null]
  ]) {
    const quote = { ...freshQuote(), lines: [{ unitPrice: '0.01', quantity }] };
    assert.deepEqual(evaluate([quote], response('answer', { total })), {
      valid: errors.length === 0, errors, requiredOutcome
    });
  }
});

test('line count accepts ten items and rejects eleven without truncating the evidence', () => {
  for (const [count, total, errors, requiredOutcome] of [
    [10, '0.10', [], 'answer'], [11, '0.11', ['invalid_evidence'], null]
  ]) {
    const lines = Array.from({ length: count }, () => ({ unitPrice: '0.01', quantity: 1 }));
    assert.deepEqual(evaluate([{ ...freshQuote(), lines }], response('answer', { total })), {
      valid: errors.length === 0, errors, requiredOutcome
    });
  }
});

test('snapshot and citation limits accept twenty pairs and distinguish schema from incomplete citations', () => {
  const evidence = Array.from({ length: 20 }, (_, i) => ({ ...freshQuote(), source: `catalog-${i}` }));
  const citations = evidence.map(({ source, version }) => ({ source, version }));
  const candidate = response('answer', { citations });
  assert.deepEqual(evaluate(evidence, candidate), { valid: true, errors: [], requiredOutcome: 'answer' });

  const extra = { ...freshQuote(), source: 'catalog-20' };
  // Keep a schema-valid candidate while exceeding the evidence bound alone.
  assert.deepEqual(evaluate([...evidence, extra], candidate), {
    valid: false, errors: ['invalid_evidence'], requiredOutcome: null
  });
  // Keep twenty valid snapshots while exceeding the citation bound alone.
  assert.deepEqual(evaluate(evidence, { ...candidate, citations: [...citations,
    { source: extra.source, version: extra.version }] }), {
    valid: false, errors: ['invalid_candidate'], requiredOutcome: null
  });
  // Nineteen citations fit the schema but do not acknowledge all twenty sources.
  assert.deepEqual(evaluate(evidence, { ...candidate, citations: citations.slice(0, 19) }), {
    valid: false, errors: ['citations_mismatch'], requiredOutcome: 'answer'
  });
});
