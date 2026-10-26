# Evidence Reliability Eval

An offline learning prototype for checking whether **precomputed structured responses** agree with declared synthetic evidence. It makes no model calls and measures no real model's quality. There are eight scenarios and 17 response controls: eight supported responses and nine deliberately inconsistent responses.

The focused core recomputes exact monetary totals from line items, checks currency-code equality, and enforces quote expiry against a fixed UTC clock. Source/version binding and conservative uncertainty outcomes support those checks. No framework integration is claimed or required.

## Run locally

Requires Node.js 22 or later. No package install, dependencies, credentials, APIs, or network access are needed. From the project folder:

```sh
npm run check
```

That one command runs the unit tests and then prints the evaluation report. For separate steps:

```sh
npm test
npm run eval
```

Both commands exit with code 0 on success. The eval exits with code 1 if any actual validity/error-code result differs from its declared expectation. Intentionally rejected candidates are expected eval outcomes; they are **not unit-test failures**. A test deliberately mislabels a control to prove that the harness detects a mismatch.

Actual verification on 2026-10-26, Node.js v24.15.0: **71 tests passed, 0 failed, 0 skipped**; eval: **8 scenarios, 17 controls, 8 accepted, 9 rejected as intended, 0 mismatches**. See `results/eval-results.json` for every candidate decision. Test timings vary and are not versioned; the eval JSON is deterministic.

Actual summary from `npm run eval` (per-control results omitted):

```json
{
  "clock": "2030-06-01T12:00:00.000Z",
  "cases": 8,
  "controls": 17,
  "accepted": 8,
  "rejected": 9,
  "mismatches": 0
}
```

The nine rejected controls are deliberately inconsistent responses correctly rejected by the assertions. Zero mismatches means all controls behaved as expected; these are not test failures or a model-quality benchmark. No model was evaluated.

## Eight synthetic scenarios

| Scenario | Supported response | Deliberately rejected response |
| --- | --- | --- |
| Exact total | USD 0.50 from 0.10 x 3 + 0.20 | USD 0.51 |
| Stale snapshot | `refresh_required` | Answer from evidence older than 60 minutes |
| Currency mismatch | USD | EUR for USD evidence |
| Source/version binding | Exact `catalog-a` / `v3` citation | Old version or wrong source |
| Unsupported cancellation/refund rule | `unknown` | Invented refund entitlement |
| Conflicting current sources | `abstain`, citing both | Cherry-picked answer citing one |
| Missing evidence | `unknown`, no citations | Confident answer without evidence |
| Exact expiry instant | `refresh_required` | Answer at the expiry boundary |

These are assertion controls designed by hand, not an independently sampled benchmark. The nine rejects demonstrate detection of these selected defects, not a statistical reliability score.

## Contract and policy

`src/evaluate.js` exports `evaluate(evidence, candidate, options)`. Inputs are plain JSON-shaped data. `fixtures/cases.js` contains all evidence and candidate fixtures; `src/run.js` compares actual results with the expected error lists. `test/evaluate.test.js` exercises controls, boundary conditions, malformed inputs, and harness mismatch detection.

The evaluation clock defaults to **2030-06-01T12:00:00.000Z**. Callers can supply an explicit `now` and `subject`; host time is never consulted. Dates must be real calendar dates in canonical `YYYY-MM-DDTHH:mm:ss.sssZ` form. Future observations and empty/reversed validity intervals are invalid inputs. Expiry is exclusive: `now >= expiresAt` requires refresh. Age is inclusive: exactly 60 minutes is accepted, and 60 minutes plus one millisecond requires refresh. Tests cover both sides of expiry and freshness boundaries.

Evidence contains one requested subject, a source/version pair, observation and expiry timestamps, currency, line items, and a cancellation/refund rule. That rule is a deliberately coarse `allowed`, `denied`, or `null`; it represents no real contract or legal entitlement. All supplied snapshots must be cited with exact source and version, including stale or conflicting snapshots. Duplicate source/version pairs are invalid. Citation order is irrelevant.

Money uses nonnegative canonical decimal **strings** with exactly two places, converted to `BigInt` cents before multiplication and addition. Binary floating-point money arithmetic, numeric extraction, rounding, tolerances, conversions, taxes, and discounts are absent. Supported currencies are explicitly limited to USD and EUR, both using two decimal places here. Codes must match exactly. Each monetary string allows up to 18 whole-number digits; quantities are positive safe integers up to 1,000,000. The bounded schema rejects oversized representations rather than rounding them. It does not support other currency precision conventions.

The required outcome follows this explicit precedence:

1. Empty evidence: `unknown`.
2. Any stale or expired snapshot: `refresh_required`.
3. Current snapshots disagree on total, currency, or refund rule: `abstain`.
4. Agreed evidence lacks the refund rule: `unknown`.
5. Otherwise: `answer`, with exact total, currency, refund rule, and citations.

An `answer` must supply all three claims. Other outcomes must set `total`, `currency`, and `refund` to `null`; partial answers are outside this tiny contract. Missing evidence (`undefined`/`null`) is malformed and rejected, whereas an explicit empty array means known absence and supports `unknown`. Missing fields, invalid types/dates/currencies, extra properties, and duplicate citations fail closed. Malformed data produces `invalid_context`, `invalid_evidence`, or `invalid_candidate`; it does not earn a valid abstention. The schema caps evidence at 20 snapshots and each quote at 10 lines. Executable objects/proxies are outside the JSON input contract.

## Threats and limits

Deterministic assertions validate **declared evidence consistency**, not the factual truth, authenticity, completeness, or real-world freshness of upstream data, and not real model reliability. A fabricated but internally consistent source could pass. Citation matching does not authenticate a publisher or establish authority between versions. The supplied evidence set is treated as complete; the harness cannot discover omitted sources. It makes no financial eligibility decisions and performs no booking, transaction, or other external action.

Only structured claims are evaluated. Free-text fields are rejected; there is no natural-language entailment, prompt-injection defense, retrieval evaluation, model judge, or model calibration. The conservative precedence is a documented local policy, not a universal conflict-resolution policy. These hand-built fixtures and boundary tests are useful for learning and regression checks, not production assurance.

## Related work and scope

There is known overlap with upstream work: [Promptfoo PR #11761: source-date evidence checks](https://github.com/promptfoo/promptfoo/pull/11761), [PR #11940: numeric-match normalization/tolerance](https://github.com/promptfoo/promptfoo/pull/11940), and [PR #9112: RAG failure modes](https://github.com/promptfoo/promptfoo/pull/9112). These links are related-work references, not claims about current PR status. No code was copied from them and no license compatibility has been assumed.

This example's concrete emphasis is recomputing totals in integer cents, exact declared currency codes, and fixed-clock interval boundary tests. It does not claim exhaustive uniqueness, maintainer interest, acceptance, or tested integration with Promptfoo. Any eventual upstream contribution should first be scoped against current work and the [contribution guide](https://www.promptfoo.dev/docs/contributing/).

## Data and publication checks

- [x] Fixtures, candidate responses, source identifiers, amounts, and dates are synthetic.
- [x] Source, fixtures, and versioned results contain no personal or production data.
- [x] No credentials, paid calls, or model calls are included.
- [x] Only allowlisted source, fixtures, tests, documentation, and deterministic eval results are versioned.
- [x] Package metadata sets `private: true`; no runtime dependencies are included.
- [ ] Before future changes, repeat the synthetic-data and commit-identity privacy review.
- [ ] Before proposing upstream work, review related work, contribution scope, licensing, and repository requirements.

`private: true` prevents accidental npm publication of this package; it is not an access-control mechanism. This repository is licensed under the [MIT License](LICENSE).
