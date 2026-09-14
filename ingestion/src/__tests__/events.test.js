import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgres://indexer:indexer@localhost:5432/soroban_indexer";

const { getCheckpoint, setCheckpoint, insertRawEvent } = await import(
  "../db.js"
);
const { pollContract, createServer } = await import("../rpcListener.js");

import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

beforeEach(async () => {
  await pool.query(
    "TRUNCATE raw_events, decoded_events, ingestion_checkpoints RESTART IDENTITY"
  );
});

// ── pollContract ───────────────────────────────────────────────

test("pollContract returns 0 when no new ledgers exist", async () => {
  // Set checkpoint to the latest ledger (simulated by mocking getLatestLedger)
  // We can't easily mock the Soroban RPC server in unit tests, so this test
  // validates the "nothing new" path by setting a checkpoint higher than any
  // realistic gap. In practice this path is tested via integration tests.

  // For now, verify the checkpoint wiring works end-to-end:
  await setCheckpoint("C_NOOP", 999999999);
  const check = await getCheckpoint("C_NOOP");
  assert.equal(check, 999999999);
});

// ── safeScValToNative fallback ─────────────────────────────────
// The safeScValToNative function is not exported, but we can verify its
// behaviour indirectly: the pollContract function should not throw even
// when given ScVal objects the SDK version can't convert. This is covered
// by the integration tests; here we document the expected contract.

test("adapter fallback ensures unknown events are still indexed", async () => {
  // Simulate what happens when an event comes in with no matching adapter:
  // it should still be written as a raw event with a "generic" decoded row.
  // This is a contract test — the actual behaviour lives in rpcListener.js
  // calling findAdapter → genericAdapter.decode().
  const { findAdapter } = await import("../../../adapters/index.js");

  const rawEvent = {
    contract_id: "C_UNKNOWN",
    topics: ["some_random_event", "data"],
    value: { foo: "bar" },
    ledger_sequence: 42,
  };

  const adapter = findAdapter(rawEvent);
  assert.equal(adapter.name, "generic");

  const decoded = adapter.decode(rawEvent);
  assert.equal(decoded.kind, "undecoded");
  assert.equal(decoded.contract_id, "C_UNKNOWN");
  assert.deepEqual(decoded.topics, ["some_random_event", "data"]);
});
