import { cases } from '../fixtures/cases.js';
import { evaluate, FIXED_NOW } from './evaluate.js';
import { pathToFileURL } from 'node:url';

export function runCases(scenarios = cases) {
  const results = scenarios.flatMap(scenario => scenario.candidates.map(control => {
    const actual = evaluate(scenario.evidence, control.candidate);
    const matched = JSON.stringify(actual.errors) === JSON.stringify(control.expectedErrors) &&
      actual.valid === (control.expectedErrors.length === 0);
    return { case: scenario.id, label: control.label, expectedValid: control.expectedErrors.length === 0,
      ...actual, matched };
  }));
  return { clock: FIXED_NOW, cases: scenarios.length, controls: results.length,
    accepted: results.filter(r => r.valid).length, rejected: results.filter(r => !r.valid).length,
    mismatches: results.filter(r => !r.matched).length, results };
}

// Importing the runner does not execute it or write files.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = runCases();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.mismatches === 0 ? 0 : 1;
}
