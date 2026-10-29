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
  const input = example();
  input.candidate.total = '0.51';
  const result = invoke(['-'], JSON.stringify(input));
  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), {
    valid: false, errors: ['total_mismatch'], requiredOutcome: 'answer'
  });
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
