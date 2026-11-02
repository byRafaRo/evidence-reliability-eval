# Review a change from input to report

Use this guide to select the right checks and review the artifacts affected by a change. Start with the [rule and control map](coverage.md) to find existing coverage; use [input limits and error recovery](input-errors.md) for schema or CLI failures. All commands below run locally without dependencies, credentials, network access, or model calls. Run them from the repository root with Node.js 22 or newer.

## Choose the review surface

The original public snapshot provided the evaluator and bundled controls. The additions below let a contributor exercise inputs independently and check the surrounding interface without changing that evaluator policy.

| What you are changing | Runnable evidence to review | Files and expectations to keep aligned |
| --- | --- | --- |
| File/stdin input, validation or exit routing | `node --test test/evaluate-input.test.js` | [CLI](../src/evaluate-input.js), CLI tests, and the [error recovery guide](input-errors.md). Assert the exact error list, required outcome, output stream and exit code. A schema error exits 2, rather than becoming a valid unknown/abstention. |
| Currency, total conflict or another evidence relationship | The isolated [EUR agreement](../examples/eur-answer.json), [conflicting totals](../examples/conflicting-totals.json) and [wrong total](../examples/wrong-total.json) examples, plus the relevant CLI regression | Keep unrelated fields valid so a rejection demonstrates the intended rule. Standalone examples do not add bundled scenarios or controls. Update the [coverage map](coverage.md) if coverage changes. |
| Core money bounds, time or outcome policy | `node --test test/evaluate.test.js` | [Evaluator](../src/evaluate.js), focused assertions and the README contract. Money is bounded decimal text converted to integer cents; a mathematically exact total can exceed the candidate schema's representable range. Do not round or clip it to obtain a passing response. |
| A documented output or bundled control | `npm run check:docs` and `npm run eval` | The three marked README JSON blocks and [recorded report](../results/eval-results.json). Change the report only when bundled results actually change, after reviewing the intended behavior. The documentation guard does not validate every prose claim or command. |
| Report privacy | The `CLI handled reports omit input payload markers` regression in the CLI test file | Test accepted, inconsistent and malformed inputs. Handled reports must not echo supplied identifiers, amounts, text or paths. This output contract does not redact files, shell history or other programs' logs. |

## Exercise a supported response and an intentional rejection

Run these separately so the expected rejection does not prevent subsequent checks:

```sh
node src/evaluate-input.js examples/answer.json
```

Expect exit 0, `valid: true`, no errors, and required outcome `answer`.

```sh
node src/evaluate-input.js examples/wrong-total.json
```

Expect exit 1, `valid: false`, only `total_mismatch`, and required outcome `answer`. Both commands write their JSON to stdout. To test error handling, use the CLI regression's malformed-input cases; those expect exit 2 and JSON on stderr. See the [recovery table](input-errors.md) before changing validation.

Do not add `expectedErrors` to a custom input. Only the bundled [fixture harness](../src/run.js) interprets those labels. Its nine intentional rejections are successful assertions when their exact expected errors match; a direct CLI rejection still exits 1.

## Finish with the complete local check

```sh
npm run check
```

This runs three gates in sequence and stops at the first failure:

1. **Tests:** inspect the named failed assertion. Check the intended policy before editing its expectation. The harness has a regression proving that a mislabeled control is detected.
2. **Documentation guard:** compare current behavior with the marked README outputs and recorded report. Review intentional changes before updating artifacts; do not silently bless drift.
3. **Bundled eval:** inspect any result with `matched: false`. Success means zero expectation mismatches, including expected rejections; the accepted count is not an accuracy score.

For a documentation-only edit, run this full command too, then manually check new links, prose and commands. The documentation guard covers selected JSON outputs only. When reporting validation, name the runtime and platform actually used; do not imply CI or cross-platform checks that were not run.

## Review the intended publication tree

Use only invented identifiers and data in examples and regression messages. Keep input payloads, local logs, delivery archives and machine-specific paths out of the intended tree. A small report that omits payloads is not permission to commit the input file itself.

Stage explicit files, then inspect their names and complete diff:

```sh
git diff --cached --name-only
git diff --cached --check
git diff --cached
```

Preserve unrelated work. Before publishing a commit, inspect both author and committer identities and use the verified personal GitHub noreply identity. Do not commit an email merely because it is the current local default. After publication, verify the remote commit and intended file contents; local tests alone do not establish what was published.

## Baseline provenance and verification limits

The [initial public snapshot](https://github.com/byRafaRo/evidence-reliability-eval/tree/0903b3e5a5e514eb9a993e9f21f0890d18e41a3b) contains the original [test source](https://github.com/byRafaRo/evidence-reliability-eval/blob/0903b3e5a5e514eb9a993e9f21f0890d18e41a3b/test/evaluate.test.js). On 2026-11-02, a local replay of those historical Git sources passed **71 tests**. Only relative module imports were redirected to in-memory copies for that replay; assertions and evaluator logic were unchanged. The historical bundled report also matched the current recorded report exactly.

The current full check on that date passed **82 tests, 0 failed, 0 skipped**, with **8 scenarios, 17 controls, 8 accepted, 9 intentionally rejected, and 0 mismatches**. Both the historical replay and current checks used Node.js v24.15.0 on Windows. The evaluator, bundled fixtures, runner and recorded report remain identical to the initial Git blobs; the extra checks exercise input handling, isolated examples, money representation, documentation drift and handled-report privacy. Test counts describe this suite, not a measure of improvement in a model.

These checks establish selected deterministic consistency assertions. They do not establish source truth or authenticity, exhaustive input coverage, model accuracy, production readiness, or a tested framework integration. A fabricated but internally consistent source can pass. See the [README limits](../README.md#threats-and-limits) and [remaining coverage limits](coverage.md#remaining-coverage-limits).
