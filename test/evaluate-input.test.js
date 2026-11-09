import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MAX_INPUT_BYTES } from '../src/evaluate-input.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const examplePath = fileURLToPath(new URL('../examples/answer.json', import.meta.url));
const example = () => JSON.parse(readFileSync(examplePath, 'utf8'));
function invoke(args, input) {
  const result = spawnSync(process.execPath, ['src/evaluate-input.js', ...args], {
    cwd: root, input, encoding: 'utf8', timeout: 5000
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  return result;
}
function expectInputError(result, error) {
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  const actual = JSON.parse(result.stderr);
  assert.equal(actual.valid, false);
  if (error) assert.deepEqual(actual.errors, [error]);
}

test('CLI accepts the documented JSON file and emits a consistent response', () => {
  const result = invoke([examplePath]);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), { valid: true, errors: [], requiredOutcome: 'answer' });
});

test('CLI stdin rejects an incorrect total with exit 1, distinct from invalid input', () => {
  const path = fileURLToPath(new URL('../examples/wrong-total.json', import.meta.url));
  const input = JSON.parse(readFileSync(path, 'utf8'));
  const result = invoke(['-'], JSON.stringify(input));
  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), {
    valid: false, errors: ['total_mismatch'], requiredOutcome: 'answer'
  });
});

test('CLI handled reports omit input payload markers across accepted, rejected and malformed inputs', () => {
  const marker = 'SYNTHETIC_INPUT_MARKER_729';
  const input = example();
  input.options.subject = marker;
  input.evidence[0].subject = marker;
  input.evidence[0].source = marker;
  input.candidate.citations[0].source = marker;
  const accepted = { valid: true, errors: [], requiredOutcome: 'answer' };
  for (const [payload, status, expected] of [
    [JSON.stringify(input), 0, accepted],
    [JSON.stringify({ ...input, candidate: { ...input.candidate, total: '0.51' } }), 1,
      { valid: false, errors: ['total_mismatch'], requiredOutcome: 'answer' }],
    [JSON.stringify({ ...input, notes: marker }), 2,
      { valid: false, errors: ['invalid_input'], requiredOutcome: null }],
    [`{"notes":"${marker}",`, 2,
      { valid: false, errors: ['invalid_json'], requiredOutcome: null }]
  ]) {
    assert.equal(payload.includes(marker), true);
    const result = invoke(['-'], payload);
    assert.equal(result.status, status);
    assert.equal((result.stdout + result.stderr).includes(marker), false);
    assert.equal(status === 2 ? result.stdout : result.stderr, '');
    assert.deepEqual(JSON.parse(status === 2 ? result.stderr : result.stdout), expected);
  }
});

test('CLI forwards an explicit subject and expiry clock to the evaluator', () => {
  const input = example();
  input.options.subject = 'custom-item';
  input.evidence[0].subject = 'custom-item';
  input.options.now = input.evidence[0].expiresAt;
  const rejected = invoke(['-'], JSON.stringify(input));
  assert.equal(rejected.status, 1);
  assert.deepEqual(JSON.parse(rejected.stdout).errors, ['outcome_mismatch']);
  input.candidate = { ...input.candidate, outcome: 'refresh_required', total: null, currency: null, refund: null };
  const accepted = invoke(['-'], JSON.stringify(input));
  assert.equal(accepted.status, 0);
  assert.equal(JSON.parse(accepted.stdout).requiredOutcome, 'refresh_required');
});

test('CLI requires abstention and complete citations for conflicting current totals', () => {
  const path = fileURLToPath(new URL('../examples/conflicting-totals.json', import.meta.url));
  const input = JSON.parse(readFileSync(path, 'utf8'));
  const accepted = invoke([path]);
  assert.equal(accepted.status, 0);
  assert.equal(accepted.stderr, '');
  assert.deepEqual(JSON.parse(accepted.stdout), { valid: true, errors: [], requiredOutcome: 'abstain' });

  // Keep both citations: answering from the first source must fail on outcome alone.
  const answer = { ...input.candidate, outcome: 'answer', total: '0.50', currency: 'USD', refund: 'denied' };
  const pickedOneTotal = invoke(['-'], JSON.stringify({ ...input, candidate: answer }));
  assert.equal(pickedOneTotal.status, 1);
  assert.equal(pickedOneTotal.stderr, '');
  assert.deepEqual(JSON.parse(pickedOneTotal.stdout), {
    valid: false, errors: ['outcome_mismatch'], requiredOutcome: 'abstain'
  });

  // Keep abstention: omitting a source must fail on citation completeness alone.
  input.candidate.citations = input.candidate.citations.slice(0, 1);
  const omittedSource = invoke(['-'], JSON.stringify(input));
  assert.equal(omittedSource.status, 1);
  assert.equal(omittedSource.stderr, '');
  assert.deepEqual(JSON.parse(omittedSource.stdout), {
    valid: false, errors: ['citations_mismatch'], requiredOutcome: 'abstain'
  });
});

test('CLI preserves a one-cent source conflict above safe integer precision and accepts exact recomputed agreement', () => {
  const path = fileURLToPath(new URL('../examples/large-total-conflict.json', import.meta.url));
  const input = JSON.parse(readFileSync(path, 'utf8'));
  const firstTotal = '9007199254740992.00';
  const secondTotal = '9007199254740992.01';
  // Demonstrate the lossy conversion this regression guards against; do not use it for money.
  assert.equal(Number(firstTotal), Number(secondTotal));

  const accepted = invoke([path]);
  assert.equal(accepted.status, 0);
  assert.equal(accepted.stderr, '');
  assert.deepEqual(JSON.parse(accepted.stdout), {
    valid: true, errors: [], requiredOutcome: 'abstain'
  });

  // Both citations remain present; selecting either source must fail on outcome alone.
  const answer = total => ({ ...input.candidate, outcome: 'answer', total, currency: 'USD', refund: 'denied' });
  for (const total of [firstTotal, secondTotal]) {
    const picked = invoke(['-'], JSON.stringify({ ...input, candidate: answer(total) }));
    assert.equal(picked.status, 1);
    assert.equal(picked.stderr, '');
    assert.deepEqual(JSON.parse(picked.stdout), {
      valid: false, errors: ['outcome_mismatch'], requiredOutcome: 'abstain'
    });
  }

  // Remove only the extra cent: different line decompositions now agree exactly.
  input.evidence[1].lines[1].unitPrice = '0.00';
  for (const [total, status, errors] of [
    [firstTotal, 0, []], [secondTotal, 1, ['total_mismatch']]
  ]) {
    const result = invoke(['-'], JSON.stringify({ ...input, candidate: answer(total) }));
    assert.equal(result.status, status);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), {
      valid: status === 0, errors, requiredOutcome: 'answer'
    });
  }
});

test('CLI supports EUR answers and abstains on equal totals with conflicting source currencies', () => {
  const path = fileURLToPath(new URL('../examples/eur-answer.json', import.meta.url));
  const input = JSON.parse(readFileSync(path, 'utf8'));
  const accepted = invoke([path]);
  assert.equal(accepted.status, 0);
  assert.equal(accepted.stderr, '');
  assert.deepEqual(JSON.parse(accepted.stdout), { valid: true, errors: [], requiredOutcome: 'answer' });

  // A valid currency code is still wrong when it contradicts agreed EUR evidence.
  const wrongCode = invoke(['-'], JSON.stringify({
    ...input, candidate: { ...input.candidate, currency: 'USD' }
  }));
  assert.equal(wrongCode.status, 1);
  assert.equal(wrongCode.stderr, '');
  assert.deepEqual(JSON.parse(wrongCode.stdout), {
    valid: false, errors: ['currency_mismatch'], requiredOutcome: 'answer'
  });

  // Change only one source's code: time, integer totals, refund, and citations agree.
  input.evidence[1].currency = 'USD';
  const conflictingCodes = invoke(['-'], JSON.stringify(input));
  assert.equal(conflictingCodes.status, 1);
  assert.equal(conflictingCodes.stderr, '');
  assert.deepEqual(JSON.parse(conflictingCodes.stdout), {
    valid: false, errors: ['outcome_mismatch'], requiredOutcome: 'abstain'
  });

  input.candidate = { ...input.candidate, outcome: 'abstain', total: null, currency: null, refund: null };
  const abstained = invoke(['-'], JSON.stringify(input));
  assert.equal(abstained.status, 0);
  assert.equal(abstained.stderr, '');
  assert.deepEqual(JSON.parse(abstained.stdout), { valid: true, errors: [], requiredOutcome: 'abstain' });
});

test('CLI rejects malformed encoding, JSON, envelope, and evaluator inputs with exit 2', () => {
  const invalidCandidate = example();
  invalidCandidate.candidate.total = 0.5;
  for (const [input, code] of [
    [Buffer.from([0xff]), 'invalid_utf8'],
    ['{"evidence":', 'invalid_json'],
    ['null', 'invalid_input'],
    [JSON.stringify({ evidence: [] }), 'invalid_input'],
    [JSON.stringify({ ...example(), expectedErrors: [] }), 'invalid_input'],
    [JSON.stringify(invalidCandidate), 'invalid_candidate'],
    [JSON.stringify({ ...example(), evidence: null }), 'invalid_evidence'],
    [JSON.stringify({ ...example(), options: null }), 'invalid_context']
  ]) expectInputError(invoke(['-'], input), code);
});

test('CLI characterizes duplicate JSON keys as last-value-wins rather than duplicate detection', () => {
  const source = JSON.stringify(example());
  const member = '"total":"0.50"';
  assert.equal(source.split(member).length, 2);
  // Submit raw text: parsing/stringifying here would erase the duplicates before the CLI sees them.
  for (const [replacement, status, valid, errors] of [
    ['"total":"0.51","total":"0.50"', 0, true, []],
    ['"total":"0.50","total":"0.51"', 1, false, ['total_mismatch']],
    ['"total":"0.51","to\\u0074al":"0.50"', 0, true, []]
  ]) {
    const result = invoke(['-'], source.replace(member, replacement));
    assert.equal(result.status, status);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), { valid, errors, requiredOutcome: 'answer' });
  }
});

test('CLI help, usage, and file errors are explicit and never expose input paths', () => {
  const help = invoke(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Exit 0:.*exit 1:.*exit 2:/);
  for (const args of [[], ['--unknown'], [examplePath, 'extra']]) {
    expectInputError(invoke(args), 'invalid_arguments');
  }
  const missing = 'examples/does-not-exist.json';
  const unreadable = invoke([missing]);
  expectInputError(unreadable, 'input_unreadable');
  assert.equal(unreadable.stderr.includes(missing), false);
  expectInputError(invoke(['examples']));
});

test('CLI bounds input bytes before JSON parsing', () => {
  expectInputError(invoke(['-'], Buffer.alloc(MAX_INPUT_BYTES + 1, 32)), 'input_too_large');
});
