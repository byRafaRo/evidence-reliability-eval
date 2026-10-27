import { openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { evaluate } from './evaluate.js';

export const MAX_INPUT_BYTES = 1024 * 1024;
const INPUT_ERRORS = new Set(['invalid_context', 'invalid_evidence', 'invalid_candidate']);
const HELP = `Usage: node src/evaluate-input.js <input.json|->
Check one synthetic evidence/candidate JSON object offline.
Use - to read JSON from standard input. Maximum input: 1 MiB of UTF-8.
Exit 0: consistent response; exit 1: inconsistent response; exit 2: invalid input or usage.
Results use stdout for exits 0/1 and stderr for exit 2.
`;

function emit(result, exitCode) {
  const output = exitCode === 2 ? process.stderr : process.stdout;
  output.write(`${JSON.stringify(result, null, 2)}\n`);
  return exitCode;
}

function fail(error) {
  return emit({ valid: false, errors: [error], requiredOutcome: null }, 2);
}

function readBytes(path) {
  const descriptor = path === '-' ? 0 : openSync(path, 'r');
  try {
    if (path !== '-' && !fstatSync(descriptor).isFile()) throw new Error('input_not_file');
    // Read at most the limit plus one byte, even if a file grows while reading.
    const bytes = Buffer.alloc(MAX_INPUT_BYTES + 1);
    let used = 0;
    while (used < bytes.length) {
      const count = readSync(descriptor, bytes, used, bytes.length - used, null);
      if (count === 0) break;
      used += count;
    }
    if (used > MAX_INPUT_BYTES) throw new Error('input_too_large');
    return bytes.subarray(0, used);
  } finally {
    if (path !== '-') closeSync(descriptor);
  }
}

/** Check a single JSON envelope; no expected-result labels or model calls. */
export function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write(HELP);
    return 0;
  }
  if (args.length !== 1 || (args[0].startsWith('-') && args[0] !== '-')) {
    return fail('invalid_arguments');
  }
  let bytes;
  try { bytes = readBytes(args[0]); }
  catch (error) {
    return fail(['input_too_large', 'input_not_file'].includes(error.message)
      ? error.message : 'input_unreadable');
  }
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return fail('invalid_utf8'); }
  let input;
  try { input = JSON.parse(text); }
  catch { return fail('invalid_json'); }
  if (input === null || typeof input !== 'object' || Array.isArray(input) ||
      !Object.hasOwn(input, 'evidence') || !Object.hasOwn(input, 'candidate') ||
      Object.keys(input).some(key => !['evidence', 'candidate', 'options'].includes(key))) {
    return fail('invalid_input');
  }
  const result = evaluate(input.evidence, input.candidate, input.options);
  const exitCode = result.valid ? 0 : result.errors.some(error => INPUT_ERRORS.has(error)) ? 2 : 1;
  return emit(result, exitCode);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
