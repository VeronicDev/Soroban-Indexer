/**
 * Example adapter for a "payment" style Soroban contract event, e.g. one
 * approved Wave repo emitting events shaped like:
 *
 *   topics: ["payment", <sender_address>, <receiver_address>]
 *   value:  { amount: "1000000", asset: "USDC" }
 *
 * TODO (real integration): replace CONTRACT_IDS below with the actual
 * deployed contract ID of the Wave repo you're indexing, and adjust the
 * topic/value shape to match that contract's real event schema (check its
 * `contractevents` in the Soroban RPC output, or its Rust source for the
 * `env.events().publish(...)` calls).
 */
export const paymentAdapter = {
  name: "payment",

  // TODO: replace with the real deployed contract ID you're adapting for.
  contractIds: ["CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4E"],

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
