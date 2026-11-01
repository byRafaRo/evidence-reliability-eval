import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { evaluate } from '../src/evaluate.js';
import { runCases } from '../src/run.js';

/** Compare declared JSON examples with current results; do not treat prose as tested. */
export function checkDocumentation(readme, recordedReport, report, answerResult, wrongTotalResult) {
  const { results, ...summary } = report;
  const expected = {
    'bundled-summary': summary, 'answer-result': answerResult, 'wrong-total-result': wrongTotalResult
  };
  const errors = [];
  for (const [id, value] of Object.entries(expected)) {
    const marker = `<!-- verify:${id} -->`;
    const start = readme.indexOf(marker);
    if (start === -1 || start !== readme.lastIndexOf(marker)) {
      errors.push(`${id}: marker_missing_or_duplicate`);
      continue;
    }
    const block = readme.slice(start + marker.length).match(/^\s*```json\r?\n([\s\S]*?)\r?\n```/);
    if (!block) { errors.push(`${id}: json_block_missing`); continue; }
    let actual;
    try { actual = JSON.parse(block[1]); }
    catch { errors.push(`${id}: invalid_json`); continue; }
    if (!isDeepStrictEqual(actual, value)) errors.push(`${id}: result_mismatch`);
  }
  if (!isDeepStrictEqual(recordedReport, report)) errors.push('recorded-eval: result_mismatch');
  return { valid: errors.length === 0, checks: [...Object.keys(expected), 'recorded-eval'], errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    const exampleResult = path => {
      const input = JSON.parse(read(path));
      return evaluate(input.evidence, input.candidate, input.options);
    };
    const result = checkDocumentation(read('README.md'), JSON.parse(read('results/eval-results.json')),
      runCases(), exampleResult('examples/answer.json'), exampleResult('examples/wrong-total.json'));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.valid ? 0 : 1;
  } catch {
    console.error(JSON.stringify({ valid: false, errors: ['documentation_input_unreadable_or_invalid'] }));
    process.exitCode = 2;
  }
}
