# Rule and control coverage guide

Use this map to find an existing check before adding a fixture or regression. It describes the assertions actually exercised by the checked-in cases and tests; it is not an instrumented branch-coverage report or a model benchmark.

The rules live in [evaluate.js](../src/evaluate.js). The eight bundled scenarios and their 17 response controls live in [cases.js](../fixtures/cases.js). Focused checks live in [evaluate.test.js](../test/evaluate.test.js), [validation-limits.test.js](../test/validation-limits.test.js) and [evaluate-input.test.js](../test/evaluate-input.test.js). Standalone JSON examples are exercised through the same evaluator by the CLI tests; they do not increase the bundled scenario/control counts.

## Map rules to checks

| Rule | Bundled scenario/control | Focused regression or runnable example |
| --- | --- | --- |
| Validate context, evidence, and candidate before selecting an outcome | The bundled controls use valid shapes; they do not demonstrate malformed inputs | Core `fails closed:` matrices cover representative missing fields, extra fields, types, dates, currencies, duplicate identities, and invalid context. The CLI malformed-input matrix checks exit 2 and stderr routing. These are not exhaustive schema boundaries. |
| Recompute exact totals from line items using integer cents | `exact-total`: accept USD 0.50; reject USD 0.51 | `BigInt retains cents far above Number.MAX_SAFE_INTEGER`; `zero price is valid`; CLI wrong-total regression. The [large-total conflict example](../examples/large-total-conflict.json) and its CLI regression preserve a one-cent source difference above safe integer precision and accept agreement from different line decompositions. `money representation limits fail closed without rounding` covers the maximum money string, the next cent above it, and a computed total beyond the response bound. See [input limits and recovery](input-errors.md). |
| A response must use the evidence's exact supported currency code | `currency-mismatch`: USD evidence with an EUR response is rejected | [eur-answer.json](../examples/eur-answer.json) demonstrates an accepted EUR answer. `CLI supports EUR answers and abstains on equal totals with conflicting source currencies` also isolates a USD response against agreed EUR evidence. Invalid-currency schema checks are separate from valid but mismatched codes. |
| Timestamp syntax, calendar validity, future observation, and nonempty validity interval | No malformed-date scenario in the bundled suite | Core `fails closed:` date/interval checks and `calendar parsing rejects invalid leap day`. |
| Age of exactly 60 minutes is valid; older evidence requires refresh | `stale-snapshot`: refresh accepted, stale answer rejected | `exactly maximum age remains valid`; `maximum age plus one millisecond refreshes`; `observation at clock is valid`. |
| Expiry is exclusive: equality requires refresh | `expiry-boundary`: refresh accepted, answer at expiry rejected | `one millisecond before expiry`, `exact expiry`, `one millisecond after expiry`; explicit-clock CLI regression. |
| An explicit empty evidence set supports `unknown` | `missing-evidence`: unknown accepted, confident answer rejected | Missing/null evidence is independently rejected as malformed, rather than treated as an empty set. |
| Agreed evidence with an unknown refund rule supports `unknown` | `unsupported-refund`: unknown accepted, invented entitlement rejected | `wrong refund claim is rejected when policy is known` separately exercises `refund_mismatch` for an otherwise supported answer. |
| Current sources disagreeing on a total, currency, or refund rule require `abstain` | `conflicting-evidence` varies the refund rule only and accepts abstention; its rejected answer also omits a citation | [conflicting-totals.json](../examples/conflicting-totals.json) isolates differing totals with matching currency/refund. The EUR CLI regression changes only one source's currency while preserving equal amounts, fresh timestamps, refund rules, and complete citations. Both require abstention; the total-conflict regression separately isolates an omitted citation. |
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

## Preserve a one-cent conflict at large totals

```sh
node src/evaluate-input.js examples/large-total-conflict.json
```

This synthetic case combines the previously separate large-number arithmetic and source-conflict checks. The first current USD source totals `9007199254740992.00`; the second totals `4503599627370496.00` times two plus `0.01`, or `9007199254740992.01`. Both agree on currency and refund rule. Abstaining with both citations exits 0; choosing either amount while citing both must exit 1 with only `outcome_mismatch`.

These distinct totals collapse to the same value if converted to JavaScript `Number`. The evaluator retains their one-cent difference using integer cents. The CLI regression demonstrates that lossy conversion as a negative example, without using it to calculate expected money values.

The regression also changes only the second source's extra cent to `0.00`. Its different line decomposition then agrees exactly with the first source, so a correctly cited answer for `9007199254740992.00` exits 0. Claiming the extra cent now exits 1 with only `total_mismatch`. This checks both conflict selection and exact answer comparison, rather than always rewarding abstention for large inputs.

The example is within the existing monetary string bound and uses the fixed UTC clock. It adds no bundled scenario/control and makes no real financial decision. This is complementary coverage of existing behavior; the evaluator policy is unchanged.

## Run the EUR agreement example

```sh
npm run evaluate -- examples/eur-answer.json
```

Both current sources agree on EUR 0.50 and the refund rule, so the supplied EUR answer exits 0 with `valid: true` and `requiredOutcome: "answer"`.

The currency regression then isolates these variations:

1. Change only the response's code to USD: exit 1 with `currency_mismatch`.
2. Retain the EUR answer and both citations, but change only the second source's code to USD: exit 1 with `outcome_mismatch` and required outcome `abstain`.
3. For that source conflict, abstain with null claims and both citations: exit 0.

Both sources still total exactly 50 integer minor units in the conflict variation. Equal numbers with different currency codes do not establish agreement. This is a currency-identity check, not exchange-rate conversion. The example and regression cover supported EUR answers and currency-only source conflict without changing evaluator rules or claiming a pre-existing runtime defect.

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

`npm run check:docs` guards the marked README summary, accepted/rejected response JSON, and the recorded fixture report against current results. The documentation regression deliberately changes counts, answers, markers, JSON syntax, and the recorded report to verify that drift fails. It does not establish coverage of unmarked examples or prose claims. The full `npm run check` command includes this guard.

`CLI handled reports omit input payload markers across accepted, rejected and malformed inputs` checks the fixed output contract with a synthetic marker present in valid identifiers, extra fields, and broken JSON. This guards report output only: it does not erase or anonymize input files, shell history, or other programs' logs. The ready-to-run [wrong-total example](../examples/wrong-total.json) demonstrates exit 1 without changing the accepted fixture.

## Pair accepted and rejected size boundaries

```sh
node --test test/validation-limits.test.js
```

These checks exercise the documented caps with otherwise valid synthetic evidence and responses. Each accepted maximum is paired with the next integer above it; expected totals are explicit decimal strings. The evaluator's limits and policy are unchanged.

| Boundary | Supported control | Rejected control |
| --- | --- | --- |
| Quantity | 1,000,000 at USD 0.01 totals USD 10000.00 | 1,000,001 with a correctly calculated total: `invalid_evidence` |
| Lines per snapshot | Ten USD 0.01 lines total USD 0.10 | Eleven lines with a correctly calculated total: `invalid_evidence` |
| Snapshot count | Twenty agreeing sources with all twenty citations | Twenty-one sources with a schema-valid twenty-citation response: `invalid_evidence` |
| Citation count | Twenty unique pairs exactly match twenty snapshots | Twenty-one unique pairs against twenty valid snapshots: `invalid_candidate` |

Oversized evidence/candidates fail schema validation with `requiredOutcome: null`; matching arithmetic does not make an oversized input valid. A separate control omits one of twenty citations: nineteen pairs fit the schema, so the result is instead `citations_mismatch` with required outcome `answer`. The twenty-source positive control also checks that these are alternative agreeing snapshots, not twenty purchases whose totals should be added together.

## Remaining coverage limits

- Quantity, line count, snapshot count and citation count now have isolated maximum/next-integer checks; monetary representation has a maximum/next-cent regression. Their cross-combinations, other identifier/schema boundaries and exhaustive combinations of amounts and quantities are not covered.
- This manual map establishes no coverage percentage, exhaustive input guarantee, or correctness proof. All examples are synthetic; consistent fabricated data could pass. Tests do not establish upstream truth, source authenticity, real model accuracy, or production readiness.
