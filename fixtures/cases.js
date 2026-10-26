// Entirely invented fixtures. These are response controls, not model outputs.
import { FIXED_NOW } from '../src/evaluate.js';

export const freshQuote = () => ({
  subject: 'sample-item', source: 'catalog-a', version: 'v3',
  observedAt: '2030-06-01T11:30:00.000Z', expiresAt: '2030-06-01T12:30:00.000Z',
  currency: 'USD', lines: [{ unitPrice: '0.10', quantity: 3 }, { unitPrice: '0.20', quantity: 1 }],
  refund: 'denied'
});
export const response = (outcome = 'answer', changes = {}) => ({
  outcome, citations: [{ source: 'catalog-a', version: 'v3' }],
  total: outcome === 'answer' ? '0.50' : null,
  currency: outcome === 'answer' ? 'USD' : null,
  refund: outcome === 'answer' ? 'denied' : null,
  ...changes
});
const accept = candidate => ({ label: 'supported control', candidate, expectedErrors: [] });
const reject = (label, candidate, ...expectedErrors) => ({ label, candidate, expectedErrors });

export const cases = [
  {
    id: 'exact-total', purpose: 'Exact integer arithmetic: 0.10 x 3 + 0.20 = 0.50.',
    evidence: [freshQuote()], candidates: [accept(response()),
      reject('wrong one-cent total', response('answer', { total: '0.51' }), 'total_mismatch')]
  },
  {
    id: 'stale-snapshot', purpose: 'Older than 60 minutes requires refresh even before quote expiry.',
    evidence: [{ ...freshQuote(), observedAt: '2030-06-01T10:59:59.999Z' }],
    candidates: [accept(response('refresh_required')),
      reject('asserting stale evidence', response(), 'outcome_mismatch')]
  },
  {
    id: 'currency-mismatch', purpose: 'An exact number in the wrong currency is inconsistent.',
    evidence: [freshQuote()], candidates: [accept(response()),
      reject('wrong currency', response('answer', { currency: 'EUR' }), 'currency_mismatch')]
  },
  {
    id: 'source-version', purpose: 'Source identity and version must match exactly.',
    evidence: [freshQuote()], candidates: [accept(response()),
      reject('old version', response('answer', { citations: [{ source: 'catalog-a', version: 'v2' }] }), 'citations_mismatch'),
      reject('wrong source', response('answer', { citations: [{ source: 'catalog-b', version: 'v3' }] }), 'citations_mismatch')]
  },
  {
    id: 'unsupported-refund', purpose: 'A missing cancellation/refund rule cannot support a claim.',
    evidence: [{ ...freshQuote(), refund: null }], candidates: [accept(response('unknown')),
      reject('invented refund entitlement', response('answer', { refund: 'allowed' }), 'outcome_mismatch')]
  },
  {
    id: 'conflicting-evidence', purpose: 'Two current sources disagree; selecting one requires abstention.',
    evidence: [freshQuote(), { ...freshQuote(), source: 'catalog-b', refund: 'allowed' }],
    candidates: [accept(response('abstain', { citations: [
      { source: 'catalog-a', version: 'v3' }, { source: 'catalog-b', version: 'v3' }
    ] })), reject('cherry-picking one source', response(), 'outcome_mismatch', 'citations_mismatch')]
  },
  {
    id: 'missing-evidence', purpose: 'An empty evidence set requires unknown with no factual claims.',
    evidence: [], candidates: [accept(response('unknown', { citations: [] })),
      reject('unsupported confident answer', response('answer', { citations: [] }), 'outcome_mismatch')]
  },
  {
    id: 'expiry-boundary', purpose: 'A quote expires at the exact expiresAt instant (exclusive validity).',
    evidence: [{ ...freshQuote(), expiresAt: FIXED_NOW }],
    candidates: [accept(response('refresh_required')),
      reject('answer at exact expiry', response(), 'outcome_mismatch')]
  }
];
