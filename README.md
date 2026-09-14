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

- API: http://localhost:4000
- Dashboard: http://localhost:5173

## Scope

This is v1 / MVP scope, intentionally limited:

- ✅ Live ingestion from a configured RPC endpoint
- ✅ Adapter pattern for per-contract decoding
- ✅ REST query API with filtering + pagination
- ✅ One example adapter + example dashboard

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
/docs        — architecture notes
```

## Contributing an adapter for your contract

See [`docs/writing-an-adapter.md`](docs/writing-an-adapter.md). This is the
main way other Wave teams should plug into this project.
