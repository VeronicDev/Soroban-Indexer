# Soroban Indexer & Analytics Layer

A self-hostable event-indexing and query layer for Soroban smart contracts.

## Why this exists

No shared event-indexing/query layer exists for Soroban today — every project
(e.g. Tikka) rolls its own one-off indexer, and Soroswap's own roadmap has listed
"implement indexer" as unfinished work for years. With 700+ approved Wave repos
now shipping contracts, most teams are hitting RPC directly instead of a shared
query layer. This project is that shared layer: any team can pull it into their
own stack unilaterally, without needing to coordinate with anyone else.

## Architecture

```
┌─────────────┐     ┌───────────┐     ┌──────────┐     ┌───────────┐
│ Soroban RPC │ ──▶ │ ingestion │ ──▶ │ Postgres │ ◀── │    api    │
└─────────────┘     └───────────┘     └──────────┘     └─────┬─────┘
                           │                                   │
                           ▼                                   ▼
                     ┌───────────┐                       ┌───────────┐
                     │ adapters  │                       │ dashboard │
                     └───────────┘                       └───────────┘
```

- **ingestion** — polls Soroban RPC for events on configured contract IDs, writes
  raw events to Postgres, tracks checkpoints so restarts don't duplicate or skip.
- **adapters** — decode raw events into structured, contract-specific schemas.
  Any team can add an adapter for their own contract without touching core code.
- **api** — REST query layer over indexed events (raw + decoded).
- **dashboard** — minimal example consumer proving the pipeline end to end.

## Quickstart

```bash
cp ingestion/.env.example ingestion/.env
cp api/.env.example api/.env
# edit .env files: set SOROBAN_RPC_URL and CONTRACT_IDS

docker compose up --build
```

- API health check: http://localhost:4000/v1/health
- Dashboard: http://localhost:5173

## API reference

All endpoints are under the `/v1/` prefix. See [docs/api.md](docs/api.md) for
full details.

| Endpoint                          | Description                                      |
| --------------------------------- | ------------------------------------------------ |
| `GET /v1/health`                  | Health check (includes DB connectivity)          |
| `GET /v1/events`                  | List events with optional filters and pagination |
| `GET /v1/events/:id`              | Get a single event by ID                         |
| `GET /v1/events/volume?contract=` | Event counts per hour for charting               |

## Scope

This is v1 / MVP scope, intentionally limited:

- ✅ Live ingestion from a configured RPC endpoint
- ✅ Adapter pattern for per-contract decoding
- ✅ REST query API with filtering + pagination
- ✅ One example adapter + example dashboard
- ✅ CORS enabled for cross-origin dashboard/API usage
- ✅ Structured JSON logging
- ✅ Graceful shutdown handling
- ✅ Health check with DB connectivity verification

Explicitly **out of scope** for this version: full historical backfill of all
Stellar ledger history, multi-chain support, a hosted/managed service. This is
meant to be self-hostable open infra, not a SaaS product.

## Repo layout

```
/ingestion   — event listener + writer service
/api         — query layer
/adapters    — per-contract event-decoding modules (shared by ingestion + api)
/dashboard   — example consumer (React/Vite)
/db          — Postgres schema/init scripts
/docs        — architecture notes and deployment guide
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, testing, and how to submit
a PR.

The main way to contribute is by writing an adapter for your contract — see
[docs/writing-an-adapter.md](docs/writing-an-adapter.md).

## Deployment

For self-hosting, see [docs/deployment.md](docs/deployment.md).

## License

See [LICENSE](LICENSE).
