import { evaluate } from '../src/evaluate.js';
import { freshQuote, response } from '../fixtures/cases.js';

// Each rule is isolated: expiry probes are fresh; age probes are unexpired.
// Expected outcomes are declared separately from the evaluator under review.
const probes = [
  ['expiry', '2030-06-01T11:59:59.999Z', 'answer'],
  ['expiry', '2030-06-01T12:00:00.000Z', 'refresh_required'],
  ['expiry', '2030-06-01T12:00:00.001Z', 'refresh_required'],
  ['maximum_age', '2030-06-01T11:59:59.999Z', 'answer'],
  ['maximum_age', '2030-06-01T12:00:00.000Z', 'answer'],
  ['maximum_age', '2030-06-01T12:00:00.001Z', 'refresh_required']
];

const results = probes.map(([rule, now, expectedOutcome]) => {
  const quote = {
    ...freshQuote(),
    observedAt: rule === 'expiry' ? '2030-06-01T11:30:00.000Z' : '2030-06-01T11:00:00.000Z',
    expiresAt: rule === 'expiry' ? '2030-06-01T12:00:00.000Z' : '2030-06-01T13:00:00.000Z'
  };
  const responses = ['answer', 'refresh_required'].map(outcome => {
    const actual = evaluate([quote], response(outcome), { now });
    const expectedValid = outcome === expectedOutcome;
    const expectedErrors = expectedValid ? [] : ['outcome_mismatch'];
    const matched = actual.valid === expectedValid && actual.requiredOutcome === expectedOutcome &&
      JSON.stringify(actual.errors) === JSON.stringify(expectedErrors);
    return { outcome, ...actual, matched };
  });
  return { rule, now, observedAt: quote.observedAt, expiresAt: quote.expiresAt,
    expectedOutcome, responses };
});

const mismatches = results.flatMap(probe => probe.responses).filter(result => !result.matched).length;
console.log(JSON.stringify({ probes: results.length, responses: results.length * 2, mismatches, results }, null, 2));
process.exitCode = mismatches === 0 ? 0 : 1;
