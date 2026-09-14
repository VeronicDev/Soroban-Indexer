/**
 * Adapter interface:
 *
 *   {
 *     name: string,                // unique adapter name, stored in decoded_events.adapter_name
 *     contractIds: string[],       // which contract IDs this adapter applies to
 *     canDecode(rawEvent): bool,   // optional extra check beyond contractIds match
 *     decode(rawEvent): object     // returns the structured schema to store as `decoded`
 *   }
 *
 * `rawEvent` is a row from `raw_events`: { contract_id, event_type, topics, value, raw_payload, ... }
 *
 * To add your own contract's adapter:
 *   1. Create adapters/yourContractAdapter.js implementing the interface above.
 *   2. Import and push it into `adapters` below.
 *   3. Set CONTRACT_IDS in ingestion/.env to include your contract ID.
 *
 * See docs/writing-an-adapter.md for a full walkthrough.
 */

import { genericAdapter } from "./genericAdapter.js";
import { paymentAdapter } from "./paymentAdapter.js";

// Order matters: first matching adapter (excluding the generic fallback) wins.
const adapters = [paymentAdapter];

export function findAdapter(rawEvent) {
  for (const adapter of adapters) {
    const contractMatches = adapter.contractIds.includes(rawEvent.contract_id);
    const extraCheckPasses = adapter.canDecode ? adapter.canDecode(rawEvent) : true;
    if (contractMatches && extraCheckPasses) {
      return adapter;
    }
  }
  return genericAdapter;
}

export { genericAdapter, paymentAdapter };
