# Writing an adapter for your contract

This is the main way other teams should plug into the indexer — you don't
need to touch `ingestion` or `api` at all.

## 1. Find your contract's real event shape

Every Soroban contract emits events via `env.events().publish((topics...), value)`
in its Rust source. Two ways to find the real shape:

- Grep your contract's Rust source for `.events().publish(`.
- Or run a raw `getEvents` call against your deployed contract ID on RPC and
  inspect a real event's `topic` and `value` fields.

## 2. Create your adapter file

Add a new file in `/adapters`, e.g. `adapters/myContractAdapter.js`:

```js
export const myContractAdapter = {
  name: "my_contract", // unique — becomes decoded_events.adapter_name
  contractIds: ["C..."], // your deployed contract ID(s)

  // Optional: extra check beyond contract ID match, e.g. by topic
  canDecode(rawEvent) {
    const topics = rawEvent.topics ?? [];
    return topics[0] === "my_event_name";
  },

  // Required: turn a raw event into your structured schema
  decode(rawEvent) {
    const topics = rawEvent.topics ?? [];
    const value = rawEvent.value ?? {};
    return {
      kind: "my_event_name",
      // ...your fields, pulled from topics/value
    };
  },
};
```

## 3. Register it

In `adapters/index.js`, import your adapter and add it to the `adapters`
array:

```js
import { myContractAdapter } from "./myContractAdapter.js";

const adapters = [paymentAdapter, myContractAdapter];
```

Order matters only if two adapters could both match the same event — the
first match in the array wins. If yours is contract-ID-specific and no other
adapter shares that contract ID, order doesn't matter.

## 4. Point ingestion at your contract

Add your contract ID to `CONTRACT_IDS` in `ingestion/.env` (comma-separated).

## 5. Test it

Add a test in `adapters/__tests__/` following the pattern in
`adapters.test.js` — construct a fake raw event matching your real event
shape and assert `decode()` produces the fields you expect.

```bash
# Run adapter tests
node --test adapters/__tests__/*.test.js
```

## What happens if you don't write an adapter

Events from unlisted contracts, or contracts without a matching adapter,
still get indexed — they just fall back to the `generic` adapter, which
stores the raw topics/value undecoded. Nothing is silently dropped; you can
always come back and add a real adapter later without re-ingesting.
