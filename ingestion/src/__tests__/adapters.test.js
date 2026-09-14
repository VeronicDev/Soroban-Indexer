import { test } from "node:test";
import assert from "node:assert/strict";
import { findAdapter, genericAdapter, paymentAdapter } from "../../../adapters/index.js";

test("findAdapter matches the payment adapter by contract id + topic", () => {
  const rawEvent = {
    contract_id: paymentAdapter.contractIds[0],
    topics: ["payment", "GSENDER", "GRECEIVER"],
    value: { amount: "1000000", asset: "USDC" },
  };

  const adapter = findAdapter(rawEvent);
  assert.equal(adapter.name, "payment");

  const decoded = adapter.decode(rawEvent);
  assert.equal(decoded.sender, "GSENDER");
  assert.equal(decoded.receiver, "GRECEIVER");
  assert.equal(decoded.amount, "1000000");
});

test("findAdapter falls back to generic for an unknown contract", () => {
  const rawEvent = {
    contract_id: "CSOMEOTHERCONTRACT",
    topics: ["mint"],
    value: { amount: "500" },
  };

  const adapter = findAdapter(rawEvent);
  assert.equal(adapter.name, "generic");

  const decoded = adapter.decode(rawEvent);
  assert.equal(decoded.kind, "undecoded");
});

test("findAdapter falls back to generic when topic doesn't match despite contract id match", () => {
  const rawEvent = {
    contract_id: paymentAdapter.contractIds[0],
    topics: ["refund", "GSENDER"],
    value: {},
  };

  const adapter = findAdapter(rawEvent);
  assert.equal(adapter.name, "generic");
});
