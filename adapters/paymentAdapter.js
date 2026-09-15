/**
 * Example adapter for a "payment" style Soroban contract event, e.g. one
 * approved Wave repo emitting events shaped like:
 *
 *   topics: ["payment", <sender_address>, <receiver_address>]
 *   value:  { amount: "1000000", asset: "USDC" }
 *
 * This is a demo adapter using a placeholder contract ID.
 * To use with a real contract:
 *   1. Replace PAYMENT_CONTRACT_IDS below with your deployed contract ID(s).
 *   2. Adjust the topic/value shape to match your contract's real event schema
 *      (check its Rust source for `env.events().publish(...)` calls).
 */
const DEMO_CONTRACT_ID = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

export const paymentAdapter = {
  name: "payment",

  contractIds: [DEMO_CONTRACT_ID], // Replace with real contract ID(s) for production use

  canDecode(rawEvent) {
    const topics = rawEvent.topics ?? [];
    return Array.isArray(topics) && topics[0] === "payment";
  },

  decode(rawEvent) {
    const topics = rawEvent.topics ?? [];
    const value = rawEvent.value ?? {};

    return {
      kind: "payment",
      sender: topics[1] ?? null,
      receiver: topics[2] ?? null,
      amount: value.amount ?? null,
      asset: value.asset ?? null,
      ledger_sequence: rawEvent.ledger_sequence,
    };
  },
};
