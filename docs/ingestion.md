# Ingestion: polling and checkpointing strategy

## Polling

The ingestion service polls Soroban RPC's `getEvents` endpoint on a fixed
interval (`POLL_INTERVAL_MS`, default 5000ms) for each configured contract ID.
It does not use a push/webhook model because standard Soroban RPC doesn't
offer one — polling is the simplest reliable approach and is easy to reason
about for a v1.

For each contract, on every tick:

1. Fetch the latest ledger sequence from RPC.
2. Compute a `startLedger` = `max(last_checkpoint + 1, latest_ledger - MAX_LEDGERS_PER_POLL)`.
   The cap exists because most RPC providers reject requests for very large
   ledger ranges; if the service has been down long enough to fall outside
   that window, it will have a gap and should be backfilled manually (see
   "Out of scope" in the root README — full backfill tooling isn't in v1).
3. Page through `getEvents` using the response cursor until no more pages are
   returned.
4. For each event: insert into `raw_events` (deduplicated via a unique
   constraint on contract + ledger + tx hash + event type), then run it
   through the adapter pipeline and insert into `decoded_events`.
5. Update `ingestion_checkpoints.last_ledger_seen` to the highest ledger
   sequence seen this poll — but only after all events in the poll have been
   written, so a crash mid-poll doesn't advance the checkpoint past
   unprocessed events.

## Checkpointing

Each contract has its own row in `ingestion_checkpoints`. This is what
makes restarts safe:

- On restart, the service reads `last_ledger_seen` per contract and resumes
  from `last_ledger_seen + 1` — no gap, no re-processing of already-written
  events.
- The `ON CONFLICT DO NOTHING` unique constraint on `raw_events` is a second
  layer of protection: even if the same ledger range is polled twice (e.g.
  a checkpoint write failed after events were already inserted), duplicate
  rows are silently skipped rather than erroring.

## Reconnection, retry, and backoff

RPC calls are wrapped in a try/catch at the per-contract level inside the
poll loop (see `src/index.js`). A failure is logged and the loop continues —
it does not crash the process or advance the checkpoint. A flaky RPC endpoint
therefore causes delayed indexing, not data loss or a dead service.

Retrying every contract on a fixed interval is counterproductive against a
rate limiter: it keeps the limiter tripped and penalises healthy contracts.
So failures are classified and the retryable ones back off (see
`src/backoff.js`):

| Failure                                          | Retried | Delay                                  |
| ------------------------------------------------ | ------- | -------------------------------------- |
| HTTP 429 (rate limit)                            | Yes     | `Retry-After` if present, else backoff |
| HTTP 408, 5xx                                    | Yes     | backoff                                |
| Socket errors (`ECONNREFUSED`, `ETIMEDOUT`, …)   | Yes     | backoff                                |
| Other 4xx (400, 403, 404)                        | Yes     | on the next tick, unthrottled          |
| JSON-RPC protocol errors (`-32602`, `-32600`, …) | Yes     | on the next tick, unthrottled          |
| Anything unrecognised                            | Yes     | backoff (bounded by `RETRY_MAX_MS`)    |

Backoff is exponential with "equal jitter": the delay ceiling doubles per
attempt, and the actual wait is randomised between 50% and 100% of it, so
several contracts tripping the same limiter don't retry in lockstep. It is
capped by `RETRY_MAX_MS`, and any successful poll clears it completely.

State is tracked **per contract**, so one throttled contract never delays
polling of the others. Non-retryable failures deliberately don't escalate
(the endpoint answered — waiting won't change the answer), but they also
don't clear an existing backoff: a client error proves the endpoint is
reachable but says nothing about whether the limiter has cleared.

Two details worth knowing:

- **Granularity.** The loop wakes every `POLL_INTERVAL_MS` and skips
  contracts that aren't due yet, so a backoff shorter than the poll interval
  just means "retry next tick".
- **Classification is by inspection, not error class.** The RPC client
  surfaces failures in three different shapes: axios errors carrying
  `status`, socket errors carrying a string `code`, and JSON-RPC errors that
  arrive as a _plain object_ with a numeric `code` (they come back with HTTP
  200, so axios sees no error at all). Unrecognised shapes are treated as
  retryable so a novel failure never silently stalls indexing forever.

To tell "throttled and backing off" apart from "broken", the error log line
carries the classification:

```json
{
  "level": "error",
  "message": "error polling C_CONTRACT",
  "error": "Request failed with status code 429",
  "contract_id": "C_CONTRACT",
  "retryable": true,
  "reason": "rate_limited",
  "attempt": 3,
  "retry_in_ms": 4000
}
```

`retryable: false` with `retry_in_ms: 0` means the request was rejected and
will be retried unthrottled — check the contract ID or request parameters.

## Known limitations (v1)

- No backfill tooling for gaps larger than `MAX_LEDGERS_PER_POLL`.
- Single-process, single-instance — no distributed locking if you run
  multiple ingestion replicas against the same contract list (don't, in v1).
- Backoff adapts within a single process's memory; it is not shared between
  replicas, and it resets on restart.
