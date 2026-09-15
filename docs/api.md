# Query API reference

Base URL (local dev): `http://localhost:4000`

## `GET /v1/health`

Health check. Returns `{ "status": "ok", "db": "connected" }` when Postgres is reachable; `503` with `"db": "disconnected"` otherwise.

`GET /health` is also available as a redirect alias for convenience.

## `GET /v1/events`

List events, most recent first, with optional filters.

**Query params** (all optional):

| param      | type     | description                                  |
| ---------- | -------- | -------------------------------------------- |
| `contract` | string   | Filter by contract ID                        |
| `type`     | string   | Filter by event type (the first topic)       |
| `from`     | ISO date | Only events with `ledger_close_time >= from` |
| `to`       | ISO date | Only events with `ledger_close_time <= to`   |
| `limit`    | int      | Max results, default 50, capped at 200       |
| `offset`   | int      | Pagination offset, default 0                 |

**Example:**

```bash
curl "http://localhost:4000/v1/events?contract=CBQH...&type=payment&limit=10"
```

```json
{
  "data": [
    {
      "id": 42,
      "contract_id": "CBQH...",
      "event_type": "payment",
      "ledger_sequence": 1234567,
      "tx_hash": "abc123...",
      "ledger_close_time": "2026-09-01T12:00:00.000Z",
      "topics": ["payment", "GSENDER...", "GRECEIVER..."],
      "value": { "amount": "1000000", "asset": "USDC" },
      "adapter_name": "payment",
      "decoded": {
        "kind": "payment",
        "sender": "GSENDER...",
        "receiver": "GRECEIVER...",
        "amount": "1000000",
        "asset": "USDC"
      }
    }
  ],
  "pagination": { "limit": 10, "offset": 0, "count": 1 }
}
```

An empty result set returns `"data": []` with HTTP 200, not an error.

## `GET /v1/events/:id`

Fetch a single event by its indexer-assigned ID, including the full raw
payload from RPC.

Returns `404` if the ID doesn't exist.

## `GET /v1/events/volume?contract=`

Event counts bucketed by hour, for charting. `contract` is required —
returns `400` if omitted.

```json
{
  "data": [
    { "bucket": "2026-09-01T10:00:00.000Z", "count": "12" },
    { "bucket": "2026-09-01T11:00:00.000Z", "count": "7" }
  ]
}
```

## Rate limiting

120 requests/minute per IP by default (see `api/src/index.js`). Adjust for
your deployment.
