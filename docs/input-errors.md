# Input limits and error recovery

Use this guide when a synthetic JSON check fails. The CLI calls the same [evaluator](../src/evaluate.js) as the bundled cases, but it reports actual consistency rather than matching expected-error labels.

```sh
node src/evaluate-input.js examples/answer.json
```

This example exits 0. Direct Node invocation avoids npm's command headers when another script needs clean JSON output. Pass `-` instead of the path for standard input. `--help` prints usage text and exits 0; it does not evaluate a response.

## Start with the exit code

| Exit | Where to read | What to do |
| --- | --- | --- |
| 0 | stdout JSON | The structured response agrees with the supplied evidence and policy. This can be a valid `unknown`, `refresh_required`, or `abstain` response, not just an answer. |
| 1 | stdout JSON | The input passed schema validation, but the response is inconsistent. Inspect `errors` and `requiredOutcome`. |
| 2 | stderr JSON | Fix usage, decoding, parsing, or schema problems first. `requiredOutcome` is null because the checker did not establish a supported outcome. |

The output never echoes input contents or file paths. An error code names a category, not the exact nested field; inspect a local copy of your synthetic input against the contract. Do not add real data to a fixture to diagnose an error.

## Exit 2: input cannot be evaluated

| Error | Check and correction |
| --- | --- |
| `invalid_arguments` | Supply exactly one file path or `-`. Use `--help` by itself. A file name starting with `-` can be passed with a directory prefix such as `./`. |
| `input_unreadable` / `input_not_file` | Check that the path exists, can be read, and names a regular file. A directory may produce either code depending on the operating system. The CLI does not repair permissions or fetch a URL. |
| `input_too_large` | Input exceeds 1 MiB (1,048,576 bytes). The limit is checked before JSON parsing, including for stdin. Use a smaller synthetic example within the schema. |
| `invalid_utf8` | Save the input as UTF-8. Invalid byte sequences are rejected rather than replaced silently. |
| `invalid_json` | Supply JSON, not a Markdown code block or JavaScript expression. Check double-quoted keys/strings, missing brackets, and trailing commas. Parsing follows standard `JSON.parse` behavior; this is not a duplicate-key detector. |
| `invalid_input` | The root must be an object with `evidence` and `candidate`, plus optional `options`. Extra keys, including `expectedErrors`, are rejected. |
| `invalid_context` | `options` must be an object containing only optional `now` and `subject`. Check canonical UTC timestamps and a valid subject identifier. Omit options to use the fixed clock and default subject. |
| `invalid_evidence` | Check every snapshot and line item: required fields, types, supported currency, money format, quantity, timestamps, subject, and unique source/version pairs. A missing/null evidence value is invalid; an explicit empty array is supported. |
| `invalid_candidate` | Check response fields and citations, including money format and range. Non-answer outcomes must set `total`, `currency`, and `refund` to null. Duplicate citations, unsupported currencies, missing fields, and extra fields are invalid. |

For the complete field relationships and outcome precedence, see the [README contract](../README.md#contract-and-policy). Schema validation runs before consistency checks, so changing only the outcome to `abstain` cannot make malformed evidence valid.

## Exit 1: response contradicts valid declared evidence

| Error | Meaning |
| --- | --- |
| `outcome_mismatch` | Use the outcome required by the documented policy: absent evidence, stale evidence, conflicting current evidence, and missing policy have different results. A correct amount from one source does not resolve conflicting sources. |
| `citations_mismatch` | Cite all supplied source/version pairs exactly, including for non-answer outcomes. Citation order is irrelevant. |
| `total_mismatch` / `currency_mismatch` / `refund_mismatch` | For an otherwise supported answer, the corresponding claim differs from the evidence. Totals use exact integer-cent arithmetic; currency codes must match without conversion. |

More than one consistency error can appear, such as a wrong outcome and incomplete citations. Do not interpret a rejection as a model score. The [coverage guide](coverage.md) shows isolated examples that distinguish these failures.

## Size and representation bounds

| Input | Supported range |
| --- | --- |
| `unitPrice`, and `total` for an answer | Nonnegative decimal strings, exactly two fractional digits, up to 18 whole-number digits; maximum `"999999999999999999.99"`. No sign, exponent notation, or extra leading zeros. |
| Quantity | Integer from 1 through 1,000,000. |
| Evidence | 0 through 20 snapshots, all for the requested subject; source/version pairs must be unique. |
| Lines in each snapshot | 1 through 10 line items. |
| Candidate citations | 0 through 20 unique pairs; consistency still requires the exact supplied evidence set. |
| Subject, source, version | 1 through 40 ASCII letters, digits, underscores, or hyphens. |
| Timestamps | Real calendar dates in `YYYY-MM-DDTHH:mm:ss.sssZ` form; a future observation or empty/reversed validity interval is invalid. |

The money bound applies to the response total as well as each input unit price. `BigInt` arithmetic can compute a larger exact total, but that does not widen the response schema:

| Synthetic input and response | Result |
| --- | --- |
| Unit price `"999999999999999999.99"`, quantity 1, matching total | Valid answer. |
| Unit price `"1000000000000000000.00"` | `invalid_evidence`: unit price has 19 whole-number digits. |
| Valid evidence, candidate total `"1000000000000000000.00"` | `invalid_candidate`: response total exceeds the representation bound. |
| Maximum supported unit price times 2; exact total `"1999999999999999999.98"` | `invalid_candidate`: the exact computed total is too wide for the response field. |
| Maximum supported unit price times 2; candidate total clipped to `"999999999999999999.99"` | `total_mismatch`: the candidate fits the schema but is not the exact computed total. |

These boundaries are covered by `money representation limits fail closed without rounding` in [evaluate.test.js](../test/evaluate.test.js). Keep synthetic test inputs and their expected totals inside the supported representation when testing a successful answer. Do not round or truncate a total to force acceptance. A larger computed result is not a binary floating-point error, and changing to `unknown` does not bypass the outcome policy.

This is a bounded offline consistency prototype, not a general accounting system. It checks neither upstream authenticity nor factual truth, and these synthetic checks establish no real model reliability or production readiness.
