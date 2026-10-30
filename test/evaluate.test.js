import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, cents, utcMs, FIXED_NOW } from '../src/evaluate.js';
import { cases, freshQuote, response } from '../fixtures/cases.js';
import { runCases } from '../src/run.js';

for (const scenario of cases) {
  for (const control of scenario.candidates) {
    test(`${scenario.id}: ${control.label}`, () => {
      const actual = evaluate(scenario.evidence, control.candidate);
      assert.deepEqual(actual.errors, control.expectedErrors);
      assert.equal(actual.valid, control.expectedErrors.length === 0);
    });
  }
}

test('harness treats intentional rejections as expected, not test failures', () => {
  const report = runCases();
  assert.equal(report.cases, 8);
  assert.equal(report.controls, 17);
  assert.equal(report.accepted, 8);
  assert.equal(report.rejected, 9);
  assert.equal(report.mismatches, 0);
});

test('harness detects a mislabeled expected outcome', () => {
  const broken = structuredClone(cases[0]);
  broken.candidates[0].expectedErrors = ['total_mismatch'];
  assert.equal(runCases([broken]).mismatches, 1);
});

for (const [label, expiresAt, outcome] of [
  ['one millisecond before expiry', '2030-06-01T12:00:00.001Z', 'answer'],
  ['exact expiry', FIXED_NOW, 'refresh_required'],
  ['one millisecond after expiry', '2030-06-01T11:59:59.999Z', 'refresh_required']
]) {
  test(label, () => assert.equal(evaluate([{ ...freshQuote(), expiresAt }], response(outcome)).valid, true));
}

for (const [label, observedAt, outcome] of [
  ['exactly maximum age remains valid', '2030-06-01T11:00:00.000Z', 'answer'],
  ['maximum age plus one millisecond refreshes', '2030-06-01T10:59:59.999Z', 'refresh_required'],
  ['observation at clock is valid', FIXED_NOW, 'answer']
]) {
  test(label, () => assert.equal(evaluate([{ ...freshQuote(), observedAt }], response(outcome)).valid, true));
}

test('BigInt retains cents far above Number.MAX_SAFE_INTEGER', () => {
  const quote = { ...freshQuote(), lines: [{ unitPrice: '99999999999999999.99', quantity: 2 }] };
  assert.equal(evaluate([quote], response('answer', { total: '199999999999999999.98' })).valid, true);
  assert.equal(cents('0.10') * 3n + cents('0.20'), 50n);
});

test('money representation limits fail closed without rounding', () => {
  const maximum = '999999999999999999.99';
  const quote = (unitPrice, quantity = 1) => ({ ...freshQuote(), lines: [{ unitPrice, quantity }] });
  assert.deepEqual(evaluate([quote(maximum)], response('answer', { total: maximum })), {
    valid: true, errors: [], requiredOutcome: 'answer'
  });
  assert.deepEqual(evaluate([quote('1000000000000000000.00')], response()), {
    valid: false, errors: ['invalid_evidence'], requiredOutcome: null
  });
  assert.deepEqual(evaluate([quote(maximum)], response('answer', { total: '1000000000000000000.00' })), {
    valid: false, errors: ['invalid_candidate'], requiredOutcome: null
  });
  assert.deepEqual(evaluate([quote(maximum, 2)], response('answer', { total: '1999999999999999999.98' })), {
    valid: false, errors: ['invalid_candidate'], requiredOutcome: null
  });
  assert.deepEqual(evaluate([quote(maximum, 2)], response('answer', { total: maximum })), {
    valid: false, errors: ['total_mismatch'], requiredOutcome: 'answer'
  });
});

test('zero price is valid', () => {
  const quote = { ...freshQuote(), lines: [{ unitPrice: '0.00', quantity: 1 }] };
  assert.equal(evaluate([quote], response('answer', { total: '0.00' })).valid, true);
});

test('an explicit clock changes the outcome without reading host time', () => {
  assert.equal(evaluate([freshQuote()], response('refresh_required'), {
    now: '2030-06-01T12:30:00.000Z'
  }).valid, true);
  const original = Date.now;
  Date.now = () => { throw new Error('host clock must not be read'); };
  try { assert.equal(evaluate([freshQuote()], response()).valid, true); }
  finally { Date.now = original; }
});

test('agreement across sources supports an answer and citation order is irrelevant', () => {
  const evidence = [freshQuote(), { ...freshQuote(), source: 'catalog-b' }];
  const candidate = response('answer', { citations: [
    { source: 'catalog-b', version: 'v3' }, { source: 'catalog-a', version: 'v3' }
  ] });
  assert.equal(evaluate(evidence, candidate).valid, true);
});

test('wrong refund claim is rejected when policy is known', () => {
  assert.deepEqual(evaluate([freshQuote()], response('answer', { refund: 'allowed' })).errors, ['refund_mismatch']);
});

test('stale evidence takes precedence over conflict and missing policy', () => {
  const evidence = [freshQuote(), { ...freshQuote(), source: 'catalog-b', refund: null, expiresAt: FIXED_NOW }];
  const candidate = response('refresh_required', { citations: evidence.map(({ source, version }) => ({ source, version })) });
  assert.equal(evaluate(evidence, candidate).valid, true);
});

const badEvidence = [
  ['missing evidence', undefined], ['null evidence', null], ['non-array evidence', {}],
  ['sparse evidence', Array(1)],
  ['missing field', [{ ...freshQuote(), refund: undefined }]],
  ['unknown field', [{ ...freshQuote(), note: 'ignore validation' }]],
  ['impossible calendar date', [{ ...freshQuote(), observedAt: '2030-02-30T11:30:00.000Z' }]],
  ['timezone offset', [{ ...freshQuote(), observedAt: '2030-06-01T11:30:00.000+00:00' }]],
  ['future observation', [{ ...freshQuote(), observedAt: '2030-06-01T12:00:00.001Z' }]],
  ['empty validity interval', [{ ...freshQuote(), expiresAt: freshQuote().observedAt }]],
  ['unknown currency', [{ ...freshQuote(), currency: 'ZZZ' }]],
  ['lowercase currency', [{ ...freshQuote(), currency: 'usd' }]],
  ['numeric unit price', [{ ...freshQuote(), lines: [{ unitPrice: 0.1, quantity: 1 }] }]],
  ['negative money', [{ ...freshQuote(), lines: [{ unitPrice: '-0.10', quantity: 1 }] }]],
  ['fractional quantity', [{ ...freshQuote(), lines: [{ unitPrice: '0.10', quantity: 1.5 }] }]],
  ['zero quantity', [{ ...freshQuote(), lines: [{ unitPrice: '0.10', quantity: 0 }] }]],
  ['empty line items', [{ ...freshQuote(), lines: [] }]],
  ['duplicate source-version', [freshQuote(), freshQuote()]],
  ['wrong subject', [{ ...freshQuote(), subject: 'other-item' }]],
  ['too many snapshots', Array.from({ length: 21 }, (_, i) => ({ ...freshQuote(), source: `source-${i}` }))]
];
for (const [label, evidence] of badEvidence) {
  test(`fails closed: ${label}`, () => assert.deepEqual(evaluate(evidence, response()).errors, ['invalid_evidence']));
}

const badCandidates = [
  ['missing candidate', undefined], ['null candidate', null],
  ['numeric total', response('answer', { total: 0.5 })],
  ['excess decimal places', response('answer', { total: '0.500' })],
  ['exponent notation', response('answer', { total: '5e-1' })],
  ['noncanonical leading zero', response('answer', { total: '00.50' })],
  ['extra free text', { ...response(), text: 'unsupported extra claim' }],
  ['missing field', { ...response(), refund: undefined }],
  ['unrecognized outcome', response('probably')],
  ['claims hidden in abstention', response('abstain', { total: '0.50' })],
  ['unsupported response currency', response('answer', { currency: 'JPY' })],
  ['wrong citation type', response('answer', { citations: ['catalog-a@v3'] })],
  ['duplicate citation', response('answer', { citations: [response().citations[0], response().citations[0]] })]
];
for (const [label, candidate] of badCandidates) {
  test(`fails closed: ${label}`, () => assert.deepEqual(evaluate([freshQuote()], candidate).errors, ['invalid_candidate']));
}

for (const [label, options] of [
  ['null options', null], ['invalid clock', { now: 'today' }],
  ['missing UTC suffix', { now: '2030-06-01T12:00:00.000' }],
  ['invalid subject', { subject: 123 }], ['unknown option', { clock: FIXED_NOW }]
]) {
  test(`fails closed: ${label}`, () => assert.deepEqual(evaluate([freshQuote()], response(), options).errors, ['invalid_context']));
}

test('calendar parsing rejects invalid leap day', () => assert.throws(() => utcMs('2030-02-29T12:00:00.000Z')));
test('validation leaves inputs unchanged', () => {
  const evidence = [freshQuote()];
  const candidate = response();
  const before = JSON.stringify({ evidence, candidate });
  evaluate(evidence, candidate);
  assert.equal(JSON.stringify({ evidence, candidate }), before);
});
