# Replay the CLI with a small review subset

Use this subset to review exact monetary consistency and the three CLI exit paths without a framework installation or the full fixture harness. It is a reproduction aid, not a proposed upstream adapter. Keep the full checkout for tests and the broader currency/time examples.

## Assemble six files

Copy these five files from the same reviewed Git revision, preserving their relative paths:

- [LICENSE](../LICENSE): retain the existing MIT notice with the copied source.
- [src/evaluate.js](../src/evaluate.js): schema validation, integer-cent arithmetic and outcome policy.
- [src/evaluate-input.js](../src/evaluate-input.js): bounded UTF-8 JSON input, report streams and exit routing.
- [examples/answer.json](../examples/answer.json): supported USD 0.50 response.
- [examples/wrong-total.json](../examples/wrong-total.json): identical evidence with an inconsistent USD 0.51 response.

Add this sixth file as `package.json` in the new folder:

```json
{
  "private": true,
  "type": "module",
  "license": "MIT",
  "engines": { "node": ">=22" }
}
```

The manifest selects ES modules and prevents npm publication. This subset intentionally has no npm scripts or dependencies; use direct Node commands. It does not include the complete repository's `npm run check` machinery. No install, model, credentials or network operation is required to replay it. Use only synthetic inputs.

## Check the three paths independently

Run from the new folder. Execute each command separately so an expected nonzero exit does not stop the remaining review.

| Command | Exit | Stream and exact parsed JSON |
| --- | --- | --- |
| `node src/evaluate-input.js examples/answer.json` | 0 | stdout: `{"valid":true,"errors":[],"requiredOutcome":"answer"}` |
| `node src/evaluate-input.js examples/wrong-total.json` | 1 | stdout: `{"valid":false,"errors":["total_mismatch"],"requiredOutcome":"answer"}` |
| `node src/evaluate-input.js -`, then supply JSON `null` and EOF on stdin | 2 | stderr: `{"valid":false,"errors":["invalid_input"],"requiredOutcome":null}` |

The other stream should be empty in each case. Output whitespace is immaterial; compare parsed JSON, the exit code and the stream together. Exit 1 is the intentional inconsistent-response demonstration. Exit 2 is an invalid input envelope; a malformed request does not receive a valid uncertainty outcome.

The supplied JSON files specify the UTC clock `2030-06-01T12:00:00.000Z`. Their snapshots are current at that clock, so the one-cent rejection isolates arithmetic consistency rather than expiry, currency or citation failure. The CLI reads input without modifying it and emits fixed result fields rather than echoing the payload. This is not an anonymizer for files or other logs.

## Expand the review only when needed

In the full checkout, run `npm run check` for tests, documented-output checks and the eight-scenario/17-control harness. That harness succeeds when every expected acceptance or rejection matches. It has different exit semantics from directly checking the intentionally wrong response above.

For currency identity, source conflict, one-cent large-total conflict and interval boundaries, follow [choosing checks](choosing-checks.md) and the [coverage map](coverage.md). Run `node examples/time-boundaries.js` separately; it is not included in this six-file subset or the aggregate check. The [contributor review workflow](contributor-review.md) describes how to review changed artifacts.

Before proposing an adaptation elsewhere, agree on the structured input contract, expected failures and host framework's result/exit conventions. The [related-work review](choosing-checks.md#relate-this-contract-to-other-work) identifies known overlap. No adapter, framework integration, maintainer acceptance or novelty is established by this subset. These deterministic synthetic assertions validate declared consistency, not source truth, authenticity, model accuracy or production readiness.
