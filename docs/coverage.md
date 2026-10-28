# Rule and control coverage guide

Use this map to find an existing check before adding a fixture or regression. It describes the assertions actually exercised by the checked-in cases and tests; it is not an instrumented branch-coverage report or a model benchmark.

The rules live in [evaluate.js](../src/evaluate.js). The eight bundled scenarios and their 17 response controls live in [cases.js](../fixtures/cases.js). Focused checks live in [evaluate.test.js](../test/evaluate.test.js) and [evaluate-input.test.js](../test/evaluate-input.test.js). Standalone JSON examples are exercised through the same evaluator by the CLI tests; they do not increase the bundled scenario/control counts.

## Map rules to checks

| Rule | Bundled scenario/control | Focused regression or runnable example |
| --- | --- | --- |
| Validate context, evidence, and candidate before selecting an outcome | The bundled controls use valid shapes; they do not demonstrate malformed inputs | Core `fails closed:` matrices cover representative missing fields, extra fields, types, dates, currencies, duplicate identities, and invalid context. The CLI malformed-input matrix checks exit 2 and stderr routing. These are not exhaustive schema boundaries. |
| Recompute exact totals from line items using integer cents | `exact-total`: accept USD 0.50; reject USD 0.51 | `BigInt retains cents far above Number.MAX_SAFE_INTEGER`; `zero price is valid`; CLI wrong-total regression. [answer.json](../examples/answer.json) is the runnable accepted example. |
| A response must use the evidence's exact supported currency code | `currency-mismatch`: USD evidence with an EUR response is rejected | Invalid-currency schema checks are separate from a valid but mismatched currency. A positive EUR answer is not separately regressed. |
| Timestamp syntax, calendar validity, future observation, and nonempty validity interval | No malformed-date scenario in the bundled suite | Core `fails closed:` date/interval checks and `calendar parsing rejects invalid leap day`. |
| Age of exactly 60 minutes is valid; older evidence requires refresh | `stale-snapshot`: refresh accepted, stale answer rejected | `exactly maximum age remains valid`; `maximum age plus one millisecond refreshes`; `observation at clock is valid`. |
| Expiry is exclusive: equality requires refresh | `expiry-boundary`: refresh accepted, answer at expiry rejected | `one millisecond before expiry`, `exact expiry`, `one millisecond after expiry`; explicit-clock CLI regression. |
| An explicit empty evidence set supports `unknown` | `missing-evidence`: unknown accepted, confident answer rejected | Missing/null evidence is independently rejected as malformed, rather than treated as an empty set. |
| Agreed evidence with an unknown refund rule supports `unknown` | `unsupported-refund`: unknown accepted, invented entitlement rejected | `wrong refund claim is rejected when policy is known` separately exercises `refund_mismatch` for an otherwise supported answer. |
| Current sources disagreeing on a total, currency, or refund rule require `abstain` | `conflicting-evidence` varies the refund rule only and accepts abstention; its rejected answer also omits a citation | [conflicting-totals.json](../examples/conflicting-totals.json) isolates differing totals with matching currency/refund. `CLI requires abstention and complete citations for conflicting current totals` separates the outcome and citation failures. Currency-only source conflict is not separately regressed. |
| Any stale source takes precedence over conflict or missing policy | No combined-precedence bundled scenario | `stale evidence takes precedence over conflict and missing policy`. |
| Cite every supplied source/version exactly, without duplicates; order is irrelevant | `source-version`: old version and wrong source rejected; conflicting-evidence controls acknowledge both or omit one | `agreement across sources supports an answer and citation order is irrelevant`; duplicate identity checks; conflicting-totals CLI regression isolates a missing citation while keeping valid abstention. |
| Non-answer outcomes carry no total/currency/refund claims | Unknown, refresh, and abstain controls set all three fields to null | `fails closed: claims hidden in abstention` checks that changing the outcome does not conceal a monetary claim. |
| Expected rejections in the fixture harness are distinct from command failures | All 17 controls declare their expected error lists | `harness detects a mislabeled expected outcome`; CLI inconsistent response exits 1; CLI extra `expectedErrors` field is rejected as invalid input. |
| Bound CLI input bytes and reject bad usage/files/encoding | Outside the bundled fixture harness | CLI input-limit, help/usage/file, and malformed-input regressions. No model or network operation is involved. |

Schema checks run before outcome selection. Malformed input therefore has `requiredOutcome: null`. After validation, precedence is empty evidence, stale/expired evidence, conflict, missing refund rule, then answer. Claim comparisons run only when both the required and supplied outcomes are `answer`; citation checks still apply to other outcomes.

## Run the isolated total-conflict example

```sh
npm run evaluate -- examples/conflicting-totals.json
```

Both snapshots are current at the fixed UTC clock, both use USD, and both say refunds are denied. Their exact recomputed totals are USD 0.50 and USD 0.60. The supplied response abstains and cites both sources, so the command exits 0 with `valid: true` and `requiredOutcome: "abstain"`.

The regression then changes one concern at a time:

1. Claim the first source's total while retaining both citations: exit 1 with only `outcome_mismatch`.
2. Abstain correctly but omit the second citation: exit 1 with only `citations_mismatch`.

This closes an isolated total-conflict coverage gap; it does not change the evaluator's policy or fix a claimed arithmetic defect. Matching one source is insufficient when the supplied current evidence conflicts. The evaluator does not rank sources or authenticate them.

## Add a useful regression

1. Identify the documented rule and the existing checks above. State what new input relationship would be missed by those checks.
2. Keep unrelated facts valid. For a total-conflict check, keep time, currency, refund rules, and citations consistent so the expected failure cannot come from another rule.
3. Include a supported response and a deliberately inconsistent variation. Assert the specific error list and, for CLI checks, the intended exit code, not only that something failed. Do not copy actual errors into expectations without checking the intended policy.
4. Reuse the existing synthetic helpers or add a small standalone JSON example. Add a bundled scenario only when it improves that demonstration; extra fixture counts are not a goal.
5. Run the focused checks, then the full suite:

```sh
node --test test/evaluate-input.test.js
npm run check
```

Update this map when the checks change. Update `results/eval-results.json` only if the bundled fixture report changes. Expected fixture rejections are successful harness assertions, while an inconsistent user-supplied CLI response exits 1.

## Remaining coverage limits

- A current-source conflict isolated to currency, and a supported EUR answer, still lack dedicated checked-in regressions. The candidate-currency mismatch scenario is not evidence of those paths.
- The exact upper limits and just-over-limit combinations for quantity, line count, monetary digit count, and snapshot count are not comprehensively paired. Existing malformed-input tests and the large-`BigInt` test cover selected cases, not every boundary.
- This manual map establishes no coverage percentage, exhaustive input guarantee, or correctness proof. All examples are synthetic; consistent fabricated data could pass. Tests do not establish upstream truth, source authenticity, real model accuracy, or production readiness.
