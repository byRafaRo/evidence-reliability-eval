import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDocumentation } from '../scripts/check-docs.js';
import { runCases } from '../src/run.js';

test('documentation guard detects result drift, broken markers/JSON, and a stale recorded report', () => {
  const report = runCases();
  const { results, ...summary } = report;
  const answer = { valid: true, errors: [], requiredOutcome: 'answer' };
  const wrongTotal = { valid: false, errors: ['total_mismatch'], requiredOutcome: 'answer' };
  const fence = '```';
  const document = (first = summary, second = answer, third = wrongTotal) =>
    `<!-- verify:bundled-summary -->\n\n${fence}json\n${JSON.stringify(first)}\n${fence}\n` +
    `<!-- verify:answer-result -->\n\n${fence}json\n${JSON.stringify(second)}\n${fence}\n` +
    `<!-- verify:wrong-total-result -->\n\n${fence}json\n${JSON.stringify(third)}\n${fence}\n`;
  const check = (text, recorded = report) => checkDocumentation(text, recorded, report, answer, wrongTotal);
  assert.equal(check(document()).valid, true);
  assert.equal(check(document().replaceAll('\n', '\r\n')).valid, true);
  for (const [actual, expected] of [
    [check(document({ ...summary, controls: summary.controls + 1 })), 'bundled-summary: result_mismatch'],
    [check(document(summary, { ...answer, valid: false })), 'answer-result: result_mismatch'],
    [check(document(summary, answer, { ...wrongTotal, valid: true })), 'wrong-total-result: result_mismatch'],
    [check(document().replace('<!-- verify:answer-result -->', '')), 'answer-result: marker_missing_or_duplicate'],
    [check(document() + '<!-- verify:answer-result -->'), 'answer-result: marker_missing_or_duplicate'],
    [check(document().replace('```json', '```text')), 'bundled-summary: json_block_missing'],
    [check(document().replace(JSON.stringify(answer), '{broken')), 'answer-result: invalid_json'],
    [check(document(), { ...report, mismatches: 1 }), 'recorded-eval: result_mismatch']
  ]) {
    assert.equal(actual.valid, false);
    assert.deepEqual(actual.errors, [expected]);
  }
});
