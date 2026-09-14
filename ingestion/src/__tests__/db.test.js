import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const { Pool } = pg;

// Use a dedicated test database — fall back to the default local dev one.
// Tests truncate tables between runs so they're idempotent.
const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  "postgres://indexer:indexer@localhost:5432/soroban_indexer";

let pool;

before(async () => {
  pool = new Pool({ connectionString: TEST_DB_URL });
  // Verify connectivity
  await pool.query("SELECT 1");
});

after(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query("TRUNCATE raw_events, decoded_events, ingestion_checkpoints RESTART IDENTITY");
});

// --- We import the module under test after setting up the pool,
//     but db.js reads DATABASE_URL from the environment at import time,
//     so we re-point it for the test process. ---
process.env.DATABASE_URL = TEST_DB_URL;

const {
  getCheckpoint,
  setCheckpoint,
  insertRawEvent,
  insertDecodedEvent,
} = await import("../db.js");

// ── Checkpoints ────────────────────────────────────────────────

test("getCheckpoint returns 0 for unknown contract", async () => {
  const result = await getCheckpoint("C_UNKNOWN");
  assert.equal(result, 0);
});

test("setCheckpoint inserts and getCheckpoint reads it back", async () => {
  await setCheckpoint("C_ALPHA", 500);
  const result = await getCheckpoint("C_ALPHA");
  assert.equal(result, 500);
});

test("setCheckpoint upserts on conflict", async () => {
  await setCheckpoint("C_BETA", 100);
  await setCheckpoint("C_BETA", 200);
  const result = await getCheckpoint("C_BETA");
  assert.equal(result, 200);
});

// ── Raw events ─────────────────────────────────────────────────

test("insertRawEvent inserts and returns an id", async () => {
  const id = await insertRawEvent({
    contractId: "C1",
    eventType: "transfer",
    ledgerSequence: 10,
    txHash: "tx1",
    ledgerCloseTime: new Date("2026-01-01T00:00:00Z"),
    topics: ["transfer", "sender", "receiver"],
    value: { amount: "100" },
    rawPayload: { ledger: 10, txHash: "tx1" },
  });

  assert.ok(id, "should return a numeric id");
  assert.equal(typeof id, "number");
});

test("insertRawEvent deduplicates via ON CONFLICT", async () => {
  const event = {
    contractId: "C2",
    eventType: "swap",
    ledgerSequence: 20,
    txHash: "tx2",
    ledgerCloseTime: new Date("2026-01-01T00:01:00Z"),
    topics: ["swap"],
    value: {},
    rawPayload: { ledger: 20 },
  };

  const id1 = await insertRawEvent(event);
  const id2 = await insertRawEvent(event);

  assert.ok(id1, "first insert returns id");
  assert.equal(id2, null, "duplicate returns null (ON CONFLICT DO NOTHING)");
});

// ── Decoded events ─────────────────────────────────────────────

test("insertDecodedEvent inserts a row linked to raw_event", async () => {
  const rawId = await insertRawEvent({
    contractId: "C3",
    eventType: "mint",
    ledgerSequence: 30,
    txHash: "tx3",
    ledgerCloseTime: new Date("2026-01-01T00:02:00Z"),
    topics: ["mint"],
    value: { to: "addr" },
    rawPayload: { ledger: 30 },
  });

  assert.ok(rawId);

  // Should not throw
  await insertDecodedEvent({
    rawEventId: rawId,
    contractId: "C3",
    adapterName: "generic",
    eventType: "mint",
    decoded: { kind: "mint" },
  });

  const { rows } = await pool.query(
    "SELECT * FROM decoded_events WHERE raw_event_id = $1",
    [rawId]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].adapter_name, "generic");
});

test("insertDecodedEvent deduplicates on (raw_event_id, adapter_name)", async () => {
  const rawId = await insertRawEvent({
    contractId: "C4",
    eventType: "burn",
    ledgerSequence: 40,
    txHash: "tx4",
    ledgerCloseTime: new Date("2026-01-01T00:03:00Z"),
    topics: ["burn"],
    value: {},
    rawPayload: { ledger: 40 },
  });

  await insertDecodedEvent({
    rawEventId: rawId,
    contractId: "C4",
    adapterName: "generic",
    eventType: "burn",
    decoded: { kind: "burn" },
  });

  // Second insert with same adapter should be silently skipped
  await insertDecodedEvent({
    rawEventId: rawId,
    contractId: "C4",
    adapterName: "generic",
    eventType: "burn",
    decoded: { kind: "burn" },
  });

  const { rows } = await pool.query(
    "SELECT count(*)::int AS cnt FROM decoded_events WHERE raw_event_id = $1",
    [rawId]
  );
  assert.equal(rows[0].cnt, 1);
});
