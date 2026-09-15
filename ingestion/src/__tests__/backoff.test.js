import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyError,
  computeBackoffDelayMs,
  createRetryTracker,
  parseRetryAfterMs,
} from "../backoff.js";

// ── Fixtures matching the shapes the SDK really throws ─────────
// Probed against @stellar/stellar-sdk: HTTP failures arrive as axios errors
// with a numeric `status`, and JSON-RPC failures arrive as a plain object
// (not an Error) because they come back with HTTP 200.

function httpError(status, headers = {}) {
  const err = new Error(`Request failed with status code ${status}`);
  err.status = status;
  err.response = { status, headers };
  return err;
}

function networkError(code) {
  const err = new Error(`connect ${code}`);
  err.code = code; // a string, unlike the numeric JSON-RPC code
  return err;
}

// ── classifyError ──────────────────────────────────────────────

test("classifyError treats 429 as a retryable rate limit", () => {
  const result = classifyError(httpError(429));
  assert.equal(result.retryable, true);
  assert.equal(result.reason, "rate_limited");
  assert.equal(result.status, 429);
});

test("classifyError treats 5xx as retryable server errors", () => {
  for (const status of [500, 502, 503]) {
    const result = classifyError(httpError(status));
    assert.equal(result.retryable, true, `status ${status} should be retryable`);
    assert.equal(result.reason, "server_error");
  }
});

test("classifyError treats 408 as a retryable timeout", () => {
  const result = classifyError(httpError(408));
  assert.equal(result.retryable, true);
  assert.equal(result.reason, "request_timeout");
});

test("classifyError treats other 4xx as non-retryable client errors", () => {
  for (const status of [400, 403, 404]) {
    const result = classifyError(httpError(status));
    assert.equal(result.retryable, false, `status ${status} should not be retried`);
    assert.equal(result.reason, "client_error");
  }
});

test("classifyError treats socket failures as retryable", () => {
  for (const code of ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"]) {
    const result = classifyError(networkError(code));
    assert.equal(result.retryable, true, `${code} should be retryable`);
    assert.equal(result.reason, "network_error");
  }
});

test("classifyError treats JSON-RPC protocol errors as non-retryable", () => {
  // A plain object, not an Error — this is what getLatestLedger actually threw.
  const rpcError = { code: -32602, message: "invalid params" };
  assert.equal(rpcError instanceof Error, false);

  const result = classifyError(rpcError);
  assert.equal(result.retryable, false);
  assert.equal(result.reason, "rpc_error");
  assert.equal(result.rpcCode, -32602);
});

test("classifyError keeps retrying JSON-RPC internal errors", () => {
  const result = classifyError({ code: -32603, message: "internal error" });
  assert.equal(result.retryable, true);
});

test("classifyError defaults unrecognised failures to retryable", () => {
  // Unknown shapes must not silently stop indexing; maxMs bounds the worst case.
  const result = classifyError(new Error("something unexpected"));
  assert.equal(result.retryable, true);
  assert.equal(result.reason, "unknown_error");
});

test("classifyError surfaces a Retry-After header on rate limits", () => {
  const result = classifyError(httpError(429, { "retry-after": "12" }));
  assert.equal(result.retryAfterMs, 12000);
});

// ── parseRetryAfterMs ──────────────────────────────────────────

test("parseRetryAfterMs reads delta-seconds", () => {
  assert.equal(parseRetryAfterMs("7"), 7000);
  assert.equal(parseRetryAfterMs(7), 7000);
  assert.equal(parseRetryAfterMs("0"), 0);
});

test("parseRetryAfterMs reads an HTTP date relative to now", () => {
  const now = Date.parse("2026-09-15T12:00:00Z");
  assert.equal(parseRetryAfterMs("Tue, 15 Sep 2026 12:00:30 GMT", now), 30000);
  // A date already in the past means "retry now", never a negative delay.
  assert.equal(parseRetryAfterMs("Tue, 15 Sep 2026 11:59:00 GMT", now), 0);
});

test("parseRetryAfterMs returns null for absent or unusable values", () => {
  assert.equal(parseRetryAfterMs(undefined), null);
  assert.equal(parseRetryAfterMs(null), null);
  assert.equal(parseRetryAfterMs(""), null);
  assert.equal(parseRetryAfterMs("soon"), null);
});

// ── computeBackoffDelayMs ──────────────────────────────────────

const BASE = 1000;
const MAX = 300_000;

test("computeBackoffDelayMs jitters between half and the full ceiling", () => {
  // random() === 0 is the floor, random() === 1 the ceiling.
  assert.equal(
    computeBackoffDelayMs({ attempt: 1, baseMs: BASE, maxMs: MAX, random: () => 0 }),
    500,
  );
  assert.equal(
    computeBackoffDelayMs({ attempt: 1, baseMs: BASE, maxMs: MAX, random: () => 1 }),
    1000,
  );
  assert.equal(
    computeBackoffDelayMs({ attempt: 3, baseMs: BASE, maxMs: MAX, random: () => 0 }),
    2000,
  );
  assert.equal(
    computeBackoffDelayMs({ attempt: 3, baseMs: BASE, maxMs: MAX, random: () => 1 }),
    4000,
  );
});

test("computeBackoffDelayMs never exceeds maxMs", () => {
  for (const attempt of [1, 5, 10, 50]) {
    const delay = computeBackoffDelayMs({
      attempt,
      baseMs: BASE,
      maxMs: MAX,
      random: () => 1,
    });
    assert.ok(delay <= MAX, `attempt ${attempt} produced ${delay}, above maxMs`);
  }
  // Squeezed all the way up, the ceiling is exactly maxMs.
  assert.equal(
    computeBackoffDelayMs({ attempt: 20, baseMs: BASE, maxMs: MAX, random: () => 1 }),
    MAX,
  );
});

// ── createRetryTracker ─────────────────────────────────────────

function makeTracker(overrides = {}) {
  let clock = 0;
  const tracker = createRetryTracker({
    baseMs: BASE,
    maxMs: MAX,
    now: () => clock,
    random: () => 1, // deterministic: always the ceiling
    ...overrides,
  });
  return { tracker, advanceTo: (t) => (clock = t), advanceBy: (ms) => (clock += ms) };
}

test("tracker escalates the delay on repeated retryable failures", () => {
  const { tracker } = makeTracker();

  assert.equal(tracker.recordFailure("C1", httpError(429)).delayMs, 1000);
  assert.equal(tracker.recordFailure("C1", httpError(429)).delayMs, 2000);
  assert.equal(tracker.recordFailure("C1", httpError(429)).delayMs, 4000);
  assert.equal(tracker.snapshot("C1").attempts, 3);
});

test("tracker holds a contract back until its backoff window elapses", () => {
  const { tracker, advanceTo } = makeTracker();
  tracker.recordFailure("C1", httpError(503));

  assert.equal(tracker.shouldAttempt("C1", 0), false);
  assert.equal(tracker.shouldAttempt("C1", 999), false);
  assert.equal(tracker.shouldAttempt("C1", 1000), true);
  advanceTo(1000);
  assert.equal(tracker.shouldAttempt("C1"), true);
});

test("tracker resets completely after a successful poll", () => {
  const { tracker } = makeTracker();
  tracker.recordFailure("C1", httpError(429));
  tracker.recordFailure("C1", httpError(429));
  assert.equal(tracker.snapshot("C1").attempts, 2);

  tracker.recordSuccess("C1");

  assert.equal(tracker.snapshot("C1").attempts, 0);
  assert.equal(tracker.shouldAttempt("C1", 0), true);
  // And the next failure starts from the base delay again, not attempt 3.
  assert.equal(tracker.recordFailure("C1", httpError(429)).delayMs, 1000);
});

test("tracker backs off per contract, not globally", () => {
  const { tracker } = makeTracker();
  tracker.recordFailure("THROTTLED", httpError(429));

  assert.equal(tracker.shouldAttempt("THROTTLED", 0), false);
  assert.equal(tracker.shouldAttempt("HEALTHY", 0), true, "a throttled peer must not delay others");
  assert.equal(tracker.recordFailure("HEALTHY", httpError(429)).attempt, 1);
});

test("tracker does not escalate for non-retryable errors", () => {
  const { tracker } = makeTracker();
  const result = tracker.recordFailure("C1", httpError(400));

  assert.equal(result.retryable, false);
  assert.equal(result.delayMs, 0);
  assert.equal(result.attempt, 0);
  // Still due immediately, so the next tick picks it straight back up.
  assert.equal(tracker.shouldAttempt("C1", 0), true);
});

test("tracker preserves prior backoff state across a non-retryable error", () => {
  const { tracker } = makeTracker();
  tracker.recordFailure("C1", httpError(429)); // attempt 1
  tracker.recordFailure("C1", httpError(429)); // attempt 2
  tracker.recordFailure("C1", httpError(400)); // client error, no escalation

  // A client error proves reachability but says nothing about the limiter, so
  // the next throttle continues from where the backoff left off.
  const next = tracker.recordFailure("C1", httpError(429));
  assert.equal(next.attempt, 3);
  assert.equal(next.delayMs, 4000);
});

test("tracker honours Retry-After over computed backoff", () => {
  const { tracker } = makeTracker();
  const result = tracker.recordFailure("C1", httpError(429, { "retry-after": "60" }));

  assert.equal(result.delayMs, 60000);
  assert.equal(tracker.shouldAttempt("C1", 59999), false);
  assert.equal(tracker.shouldAttempt("C1", 60000), true);
});

test("tracker bounds Retry-After by maxMs", () => {
  const { tracker } = makeTracker({ maxMs: 5000 });
  const result = tracker.recordFailure("C1", httpError(429, { "retry-after": "600" }));

  assert.equal(result.delayMs, 5000, "a bad header must not stall a contract indefinitely");
});
