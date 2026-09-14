import { test } from "node:test";
import assert from "node:assert/strict";
import { genericAdapter, paymentAdapter, findAdapter } from "../index.js";

// ── genericAdapter ─────────────────────────────────────────────

test("genericAdapter decode preserves raw fields", () => {
  const raw = {
    contract_id: "C_ANY",
    event_type: "something",
    topics: ["something", "a", "b"],
    value: { x: 1 },
  };

  const decoded = genericAdapter.decode(raw);

  assert.equal(decoded.kind, "undecoded");
  assert.equal(decoded.contract_id, "C_ANY");
  assert.equal(decoded.event_type, "something");
  assert.deepEqual(decoded.topics, ["something", "a", "b"]);
  assert.deepEqual(decoded.value, { x: 1 });
});

test("genericAdapter decode handles null topics/value", () => {
  const raw = {
    contract_id: "C_NULLS",
    event_type: null,
    topics: null,
    value: null,
  };

  const decoded = genericAdapter.decode(raw);
  assert.equal(decoded.topics, null);
  assert.equal(decoded.value, null);
});

// ── paymentAdapter ─────────────────────────────────────────────

test("paymentAdapter canDecode returns true for payment topic", () => {
  const raw = { topics: ["payment", "sender", "receiver"] };
  assert.equal(paymentAdapter.canDecode(raw), true);
});

test("paymentAdapter canDecode returns false for non-payment topic", () => {
  const raw = { topics: ["swap", "a", "b"] };
  assert.equal(paymentAdapter.canDecode(raw), false);
});

test("paymentAdapter canDecode returns false for missing topics", () => {
  assert.equal(paymentAdapter.canDecode({ topics: [] }), false);
  assert.equal(paymentAdapter.canDecode({}), false);
});

test("paymentAdapter decode extracts sender/receiver/amount/asset", () => {
  const raw = {
    contract_id: "C_PAY",
    event_type: "payment",
    topics: ["payment", "G_SENDER", "G_RECEIVER"],
    value: { amount: "5000", asset: "USDC" },
    ledger_sequence: 12345,
  };

  const decoded = paymentAdapter.decode(raw);

  assert.equal(decoded.kind, "payment");
  assert.equal(decoded.sender, "G_SENDER");
  assert.equal(decoded.receiver, "G_RECEIVER");
  assert.equal(decoded.amount, "5000");
  assert.equal(decoded.asset, "USDC");
  assert.equal(decoded.ledger_sequence, 12345);
});

test("paymentAdapter decode handles missing optional fields", () => {
  const raw = {
    contract_id: "C_PAY",
    event_type: "payment",
    topics: ["payment"],
    value: {},
    ledger_sequence: 100,
  };

  const decoded = paymentAdapter.decode(raw);
  assert.equal(decoded.sender, null);
  assert.equal(decoded.receiver, null);
  assert.equal(decoded.amount, null);
  assert.equal(decoded.asset, null);
});

// ── findAdapter routing ────────────────────────────────────────

test("findAdapter returns paymentAdapter for matching contract + topic", () => {
  const contractId = paymentAdapter.contractIds[0];
  const raw = {
    contract_id: contractId,
    topics: ["payment", "s", "r"],
    value: {},
  };

  const adapter = findAdapter(raw);
  assert.equal(adapter.name, "payment");
});

test("findAdapter returns genericAdapter for unknown contract", () => {
  const raw = {
    contract_id: "C_UNKNOWN_123",
    topics: ["something"],
    value: {},
  };

  const adapter = findAdapter(raw);
  assert.equal(adapter.name, "generic");
});

test("findAdapter returns genericAdapter when topic does not match", () => {
  const contractId = paymentAdapter.contractIds[0];
  const raw = {
    contract_id: contractId,
    topics: ["not_a_payment"],
    value: {},
  };

  const adapter = findAdapter(raw);
  assert.equal(adapter.name, "generic");
});
