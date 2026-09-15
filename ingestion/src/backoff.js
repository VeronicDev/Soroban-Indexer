/**
 * Retry classification and per-contract backoff for RPC polling.
 *
 * The Soroban RPC client (@stellar/stellar-sdk) surfaces failures in three
 * different shapes, so classification inspects properties rather than relying
 * on error classes:
 *
 *   - HTTP errors (axios):  an Error carrying `status` (429, 500, ...) and
 *                           `response.headers`. Network failures carry a string
 *                           `code` such as ECONNREFUSED or ETIMEDOUT.
 *   - JSON-RPC errors:      a *plain object* with a numeric `code` (-32602) and
 *                           `message`. It is not an Error instance, and axios
 *                           does not treat it as a failure because it arrives
 *                           with HTTP 200.
 *   - Anything else:        treated as retryable, so a failure shape we don't
 *                           recognise keeps retrying (bounded by maxMs) rather
 *                           than silently stalling indexing forever.
 */

// JSON-RPC codes meaning the request itself is wrong — retrying cannot help.
const NON_RETRYABLE_RPC_CODES = new Set([
  -32700, // parse error
  -32600, // invalid request
  -32601, // method not found
  -32602, // invalid params
]);

// Socket-level failures, reported as a string `code` on the error.
const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "ETIMEDOUT",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
  "ENOTFOUND",
  "ERR_NETWORK",
  "ERR_SOCKET_CONNECTION_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

function httpStatus(err) {
  const status = err?.status ?? err?.response?.status;
  return Number.isInteger(status) ? status : null;
}

/**
 * Parse a `Retry-After` header, which is either delta-seconds or an HTTP date.
 * Returns null when absent or unusable.
 */
export function parseRetryAfterMs(value, now = Date.now()) {
  if (value === undefined || value === null) return null;

  const raw = String(value).trim();
  if (raw === "") return null;

  if (/^\d+$/.test(raw)) {
    return Number(raw) * 1000;
  }

  const when = Date.parse(raw);
  if (Number.isNaN(when)) return null;
  return Math.max(0, when - now);
}

/**
 * Decide whether a failed RPC call is worth retrying.
 *
 * Always returns the same shape so callers can log it directly:
 *   { retryable, reason, status, rpcCode, retryAfterMs }
 */
export function classifyError(err) {
  const status = httpStatus(err);
  // Only meaningful for HTTP failures; those are the only ones with headers.
  const retryAfterMs = parseRetryAfterMs(err?.response?.headers?.["retry-after"]);
  const code = err?.code;
  const rpcCode = typeof code === "number" ? code : null;

  if (status !== null) {
    if (status === 429) {
      return { retryable: true, reason: "rate_limited", status, rpcCode, retryAfterMs };
    }
    if (status === 408) {
      return { retryable: true, reason: "request_timeout", status, rpcCode, retryAfterMs };
    }
    if (status >= 500) {
      return { retryable: true, reason: "server_error", status, rpcCode, retryAfterMs };
    }
    if (status >= 400) {
      // The endpoint answered and rejected the request, so waiting won't help.
      return { retryable: false, reason: "client_error", status, rpcCode, retryAfterMs: null };
    }
  }

  if (rpcCode !== null && NON_RETRYABLE_RPC_CODES.has(rpcCode)) {
    return { retryable: false, reason: "rpc_error", status, rpcCode, retryAfterMs: null };
  }

  if (typeof code === "string" && RETRYABLE_NETWORK_CODES.has(code)) {
    return { retryable: true, reason: "network_error", status, rpcCode, retryAfterMs };
  }

  return { retryable: true, reason: "unknown_error", status, rpcCode, retryAfterMs };
}

/**
 * Exponential backoff with "equal jitter": the ceiling doubles per attempt but
 * the actual wait is randomised between 50% and 100% of it, so several
 * contracts tripping the same limiter don't retry in lockstep.
 */
export function computeBackoffDelayMs({ attempt, baseMs, maxMs, random = Math.random }) {
  const ceiling = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  const half = ceiling / 2;
  return Math.round(half + random() * half);
}

/**
 * Tracks failure state per contract, so one throttled contract doesn't slow
 * down polling of the healthy ones.
 *
 * `now` and `random` are injectable to keep tests deterministic.
 */
export function createRetryTracker({
  baseMs,
  maxMs,
  now = () => Date.now(),
  random = Math.random,
}) {
  const states = new Map();

  function stateFor(contractId) {
    let state = states.get(contractId);
    if (!state) {
      state = { attempts: 0, nextAttemptAt: 0 };
      states.set(contractId, state);
    }
    return state;
  }

  return {
    /** False while a contract is still inside its backoff window. */
    shouldAttempt(contractId, at = now()) {
      return at >= stateFor(contractId).nextAttemptAt;
    },

    /** A successful poll clears the backoff completely. */
    recordSuccess(contractId) {
      states.delete(contractId);
    },

    /**
     * Record a failure and report what the caller should log.
     *
     * Retryable failures escalate the delay. Non-retryable ones leave the delay
     * alone so the next tick picks the contract straight back up: a request the
     * RPC will always reject shouldn't push itself into a long backoff. The
     * attempt count is deliberately preserved for non-retryable failures — a
     * client error proves the endpoint is reachable but says nothing about
     * whether a rate limiter has cleared.
     */
    recordFailure(contractId, err, at = now()) {
      const classification = classifyError(err);
      const state = stateFor(contractId);

      if (!classification.retryable) {
        state.nextAttemptAt = at;
        return { ...classification, attempt: state.attempts, delayMs: 0 };
      }

      state.attempts += 1;
      const backoffMs = computeBackoffDelayMs({
        attempt: state.attempts,
        baseMs,
        maxMs,
        random,
      });
      // An explicit Retry-After wins, but is still bounded by maxMs so a single
      // bad header can't stall a contract indefinitely.
      const delayMs = Math.min(maxMs, Math.max(backoffMs, classification.retryAfterMs ?? 0));
      state.nextAttemptAt = at + delayMs;

      return { ...classification, attempt: state.attempts, delayMs };
    },

    /** Current state for a contract, for logging and tests. */
    snapshot(contractId) {
      const { attempts, nextAttemptAt } = stateFor(contractId);
      return { attempts, nextAttemptAt };
    },
  };
}
