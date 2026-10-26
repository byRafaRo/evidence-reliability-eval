/** Deterministic policy constants: no wall clock, network, model or credentials. */
export const FIXED_NOW = '2030-06-01T12:00:00.000Z';
export const MAX_AGE_MS = 60 * 60 * 1000;
const OUTCOMES = ['answer', 'refresh_required', 'unknown', 'abstain'];
const CURRENCIES = ['USD', 'EUR']; // Both have two decimal places in this toy schema.
const REFUND_RULES = ['allowed', 'denied', null];
const plain = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const keys = (value, expected) => plain(value) &&
  Object.keys(value).sort().join('|') === [...expected].sort().join('|');
const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(value);
const denseArray = value => Array.isArray(value) && Object.keys(value).length === value.length;

/** Only canonical UTC timestamps are accepted, including calendar validation. */
export function utcMs(value) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new TypeError('Expected an explicit UTC timestamp with milliseconds');
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new TypeError('Invalid calendar timestamp');
  }
  return parsed;
}

/** Money enters as canonical decimal strings; arithmetic uses integer cents. */
export function cents(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,17})\.\d{2}$/.test(value)) {
    throw new TypeError('Expected a nonnegative decimal string with two places');
  }
  return BigInt(value.replace('.', ''));
}

function validEvidence(evidence, now) {
  if (!denseArray(evidence) || evidence.length > 20) return false;
  const seen = new Set();
  return evidence.every(quote => {
    if (!keys(quote, ['subject', 'source', 'version', 'observedAt', 'expiresAt',
      'currency', 'lines', 'refund'])) return false;
    if (![quote.subject, quote.source, quote.version].every(id) ||
        !CURRENCIES.includes(quote.currency) || !REFUND_RULES.includes(quote.refund)) return false;
    // A duplicate citation is ambiguous, even if both payloads happen to agree.
    const citation = `${quote.source}@${quote.version}`;
    if (seen.has(citation)) return false;
    seen.add(citation);
    const observed = utcMs(quote.observedAt);
    const expires = utcMs(quote.expiresAt);
    if (observed > now || expires <= observed) return false;
    return denseArray(quote.lines) && quote.lines.length > 0 && quote.lines.length <= 10 &&
      quote.lines.every(line => keys(line, ['unitPrice', 'quantity']) &&
        Number.isSafeInteger(line.quantity) && line.quantity > 0 && line.quantity <= 1_000_000 &&
        cents(line.unitPrice) >= 0n);
  });
}

function validCandidate(candidate) {
  if (!keys(candidate, ['outcome', 'citations', 'total', 'currency', 'refund']) ||
      !OUTCOMES.includes(candidate.outcome) || !denseArray(candidate.citations) ||
      candidate.citations.length > 20 ||
      !candidate.citations.every(citation => keys(citation, ['source', 'version']) &&
        id(citation.source) && id(citation.version))) return false;
  const unique = new Set(candidate.citations.map(c => `${c.source}@${c.version}`));
  if (unique.size !== candidate.citations.length) return false;
  if (candidate.outcome !== 'answer') {
    return candidate.total === null && candidate.currency === null && candidate.refund === null;
  }
  return cents(candidate.total) >= 0n && CURRENCIES.includes(candidate.currency) &&
    ['allowed', 'denied'].includes(candidate.refund);
}

function total(quote) {
  return quote.lines.reduce((sum, line) => sum + cents(line.unitPrice) * BigInt(line.quantity), 0n);
}

/**
 * @param {unknown} evidence Synthetic quote snapshots for one requested subject.
 * @param {unknown} candidate Precomputed structured response; no free text allowed.
 * @param {{now?: string, subject?: string}} options Explicit evaluation context.
 * @returns {{valid: boolean, errors: string[], requiredOutcome: string|null}}
 */
export function evaluate(evidence, candidate, options = {}) {
  const reject = error => ({ valid: false, errors: [error], requiredOutcome: null });
  if (!plain(options) || Object.keys(options).some(key => !['now', 'subject'].includes(key))) {
    return reject('invalid_context');
  }
  const { now = FIXED_NOW, subject = 'sample-item' } = options;
  let clock;
  try { clock = utcMs(now); } catch { return reject('invalid_context'); }
  if (!id(subject)) return reject('invalid_context');
  try {
    if (!validEvidence(evidence, clock) || evidence.some(q => q.subject !== subject)) {
      return reject('invalid_evidence');
    }
  } catch { return reject('invalid_evidence'); }
  try { if (!validCandidate(candidate)) return reject('invalid_candidate'); }
  catch { return reject('invalid_candidate'); }

  // Conservative precedence: absent -> unknown; any stale -> refresh; conflict
  // -> abstain; missing policy -> unknown; otherwise a supported answer.
  let requiredOutcome = 'answer';
  if (evidence.length === 0) requiredOutcome = 'unknown';
  else if (evidence.some(q => clock >= utcMs(q.expiresAt) || clock - utcMs(q.observedAt) > MAX_AGE_MS)) {
    requiredOutcome = 'refresh_required';
  } else if (new Set(evidence.map(q => `${q.currency}|${total(q)}|${q.refund}`)).size > 1) {
    requiredOutcome = 'abstain';
  } else if (evidence[0].refund === null) requiredOutcome = 'unknown';

  const errors = [];
  if (candidate.outcome !== requiredOutcome) errors.push('outcome_mismatch');
  // All supplied evidence must be acknowledged, including conflict/stale evidence.
  const signature = values => values.map(c => `${c.source}@${c.version}`).sort().join('|');
  if (signature(candidate.citations) !== signature(evidence)) errors.push('citations_mismatch');
  if (candidate.outcome === 'answer' && requiredOutcome === 'answer') {
    if (cents(candidate.total) !== total(evidence[0])) errors.push('total_mismatch');
    if (candidate.currency !== evidence[0].currency) errors.push('currency_mismatch');
    if (candidate.refund !== evidence[0].refund) errors.push('refund_mismatch');
  }
  return { valid: errors.length === 0, errors, requiredOutcome };
}
