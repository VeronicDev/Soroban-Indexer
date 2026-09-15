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

## Reconnection/retry

RPC calls are wrapped in a try/catch at the per-contract level inside the
poll loop (see `src/index.js`). A transient RPC error (timeout, rate limit,
temporary network issue) is logged and the loop continues to the next
contract/tick — it does not crash the process or advance the checkpoint.
This means a flaky RPC endpoint causes delayed indexing, not data loss or a
dead service.

## Known limitations (v1)

- No backfill tooling for gaps larger than `MAX_LEDGERS_PER_POLL`.
- Single-process, single-instance — no distributed locking if you run
  multiple ingestion replicas against the same contract list (don't, in v1).
- RPC provider rate limits aren't specifically handled with backoff; if you
  hit them frequently, increase `POLL_INTERVAL_MS` or reduce the number of
  contracts polled by a single instance.
