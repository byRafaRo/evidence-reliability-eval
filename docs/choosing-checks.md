# Choose a check for the claim you have

This prototype accepts precomputed structured claims and declared synthetic evidence. Its contract is useful when you need exact line-item arithmetic, separate currency identity, and explicit validity intervals. It does not extract an answer from prose or judge the quality of a model's reasoning.

| Input or question | Local check and runnable starting point | Boundary of the claim |
| --- | --- | --- |
| Does the response equal the recomputed total? | Run `node src/evaluate-input.js examples/answer.json`, then `node src/evaluate-input.js examples/wrong-total.json` separately. The first exits 0; the second exits 1 with `total_mismatch`. | Canonical two-decimal strings and integer cents, without rounding or tolerance. No prose extraction, scale normalization or tax/discount calculation. |
| Do the amount and currency both match? | Run `node src/evaluate-input.js examples/eur-answer.json`. The CLI regression changes only the response currency to USD and expects `currency_mismatch`; it also isolates a currency-only conflict between sources. | Equal numbers do not make USD and EUR interchangeable. There is no exchange-rate conversion. |
| Can a current answer be given when sources disagree? | Run `node src/evaluate-input.js examples/conflicting-totals.json`. It exits 0 for a valid abstention citing both sources. | Complete citation of the supplied set is required. The evaluator cannot discover missing sources or rank their authority. |
| Is an otherwise supported answer usable immediately around expiry or maximum age? | Run the boundary example below. | Canonical UTC timestamps, explicit comparison clocks and a documented local policy. This is separate from authenticating a source or establishing its real-world freshness. |

Malformed representations are schema failures, not approximate answers: for example, numeric JSON `0.50` or string `"0.500"` cannot replace canonical string `"0.50"`. See [input limits and recovery](input-errors.md) for exit 2 and fixed error codes. See the [coverage map](coverage.md) before adding another regression.

## Run the time-boundary comparison

```sh
node examples/time-boundaries.js
```

The dependency-free example uses only invented evidence and explicit UTC clocks. It holds each snapshot fixed while moving the comparison clock by one millisecond around noon:

| Probe group | 11:59:59.999Z | 12:00:00.000Z | 12:00:00.001Z |
| --- | --- | --- | --- |
| Expiry at noon; observed at 11:30 | `answer` | `refresh_required` | `refresh_required` |
| Observed at 11:00; expires at 13:00 | `answer` | `answer` | `refresh_required` |

All timestamps use 2030-06-01. Expiry is exclusive (`now >= expiresAt`), while maximum age is inclusive (exactly 60 minutes is still usable). The expiry snapshots remain younger than 60 minutes; the maximum-age snapshots remain unexpired. Thus each group isolates one rule.

For each of the six probes, the script checks both an answer and a refresh response against independently declared expectations. It prints deterministic JSON with **6 probes, 12 responses and 0 mismatches**, then exits 0. Six responses are intentionally rejected with only `outcome_mismatch`; these are successful demonstrations when matched. Exit 1 means a validity decision, required outcome or exact error list differed from its expectation.

This example is an additional command; `npm run check` does not execute it. Run both when changing it. It does not add scenarios to the bundled eight-scenario/17-control suite, and its responses are not model samples. The existing core tests already cover expiry/freshness rules; this is a runnable comparison, not a claim that an arithmetic or time defect was fixed.

## Relate this contract to other work

The following are descriptions of the linked proposals, not tested adapters or recommendations to install unmerged work:

- [Promptfoo #11761](https://github.com/promptfoo/promptfoo/pull/11761) supplies an offline example checking citation identity, dated snapshots and completeness. It overlaps with evidence/date consistency; this local prototype instead requires the complete supplied citation set and recomputes structured monetary claims.
- [Promptfoo #11940](https://github.com/promptfoo/promptfoo/pull/11940) proposes extracting stated numeric answers, normalizing scales and representations, and comparing with a tolerance. That addresses a different input contract from exact canonical decimal strings plus a separate supported currency code here. Setting a numeric tolerance to zero alone would not establish the line-item, currency and evidence-time checks in this prototype.
- [Promptfoo #9112](https://github.com/promptfoo/promptfoo/pull/9112) describes broader RAG failure-mode examples involving retrieved context, supported relationships and citations. This local structured-data example performs no retrieval or natural-language entailment.

Choose based on your reviewed input contract and expected decisions. No upstream code was copied, no integration was run, and these references establish no maintainer acceptance or exhaustive novelty. All local examples check declared consistency only: fabricated but consistent evidence can pass. Source authenticity, factual truth, real model accuracy and production readiness remain outside these demonstrations.
