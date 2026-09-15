# Soroban Indexer & Analytics Layer

A self-hostable event-indexing and query layer for Soroban smart contracts.

Point it at a Soroban RPC endpoint and a list of contract IDs, and you get a
Postgres-backed event store plus a REST API and a reference dashboard on top of
it — without writing your own indexer from scratch.

---

## Table of contents

- [Why this exists](#why-this-exists)
- [What you get](#what-you-get)
- [Architecture](#architecture)
- [Data model](#data-model)
- [Quickstart](#quickstart)
- [Configuration](#configuration)
- [API reference](#api-reference)
- [Writing an adapter for your contract](#writing-an-adapter-for-your-contract)
- [Dashboard](#dashboard)
- [Running tests](#running-tests)
- [Repo layout](#repo-layout)
- [Scope and roadmap](#scope-and-roadmap)
- [Deployment and scaling](#deployment-and-scaling)
- [Contributing](#contributing)
- [License](#license)

---

## Why this exists

No shared event-indexing/query layer exists for Soroban today — every project
(e.g. Tikka) rolls its own one-off indexer, and Soroswap's own roadmap has listed
"implement indexer" as unfinished work for years. With 700+ approved Wave repos
now shipping contracts, most teams are hitting RPC directly instead of a shared
query layer. This project is that shared layer: any team can pull it into their
own stack unilaterally, without needing to coordinate with anyone else.

Concretely, that means you can:

- Query contract events with filters and pagination instead of hand-rolling RPC
  `getEvents` calls in every frontend and backend.
- Decode events into a schema that fits your domain, through a small adapter
  module, without forking the core services.
- Run the whole thing on your own infrastructure, on testnet or mainnet.

## What you get

| Capability            | Detail                                                                 |
| --------------------- | ---------------------------------------------------------------------- |
| Live ingestion        | Polls Soroban RPC for events on the contract IDs you configure         |
| Crash-safe checkpoint | Per-contract ledger checkpoints so restarts don't duplicate or skip    |
| Raw + decoded storage | Every event stored verbatim, plus an adapter-decoded structured copy   |
| REST query API        | Filtering, pagination, single-event lookup, hourly volume for charting |
| Adapter pattern       | Per-contract decoding modules shared by ingestion and the API          |
| Example dashboard     | React/Vite consumer proving the pipeline end to end                    |
| Operational niceties  | CORS, structured JSON logs, graceful shutdown, DB-backed health check  |

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
  raw events to Postgres, and tracks per-contract checkpoints so restarts don't
  duplicate or skip events. See [docs/ingestion.md](docs/ingestion.md) for the
  polling and checkpointing strategy in detail.
- **adapters** — decode raw events into structured, contract-specific schemas.
  Any team can add an adapter for their own contract without touching core code.
  Events with no matching adapter fall back to the `generic` adapter, so nothing
  is silently dropped.
- **api** — REST query layer over indexed events (raw + decoded), read-only and
  stateless.
- **dashboard** — minimal example consumer (React + Vite + Recharts) proving the
  pipeline end to end.
- **db** — Postgres schema in [`db/init.sql`](db/init.sql), mounted as the
  docker-compose init script.

The three services share a single Postgres database and a single npm-free
`adapters/` directory, and communicate only through the database and the HTTP
API — there is no message bus and no shared runtime state.

## Data model

Defined in [`db/init.sql`](db/init.sql):

| Table                   | Purpose                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `raw_events`            | Events exactly as ingested from RPC (`topics`, `value`, `raw_payload`). Unique on contract + ledger + tx + type. |
| `decoded_events`        | Adapter output; `decoded` holds the adapter-specific schema. Unique on raw event + adapter name.                 |
| `ingestion_checkpoints` | Last ledger sequence processed per contract, used to resume after a restart.                                     |

`raw_events` has indexes on `contract_id`, `ledger_sequence`, and
`ledger_close_time`; `decoded_events` has indexes on `contract_id` and
`event_type`. The unique constraint on `raw_events` is what makes ingestion
idempotent — re-polling the same ledger range inserts nothing rather than
duplicating or erroring.

## Quickstart

The fastest path is Docker Compose, which starts Postgres, ingestion, the API,
and the dashboard together:

```bash
cp ingestion/.env.example ingestion/.env
cp api/.env.example api/.env
# edit .env files: set SOROBAN_RPC_URL and CONTRACT_IDS

docker compose up --build
```

Then:

- API health check: http://localhost:4000/v1/health
- Dashboard: http://localhost:5173

To run it in the background and watch ingestion:

```bash
docker compose up --build -d
docker compose logs -f ingestion
```

### Prefer to run services directly?

Requires Node.js 20+ and a reachable Postgres.

```bash
# 1. Create the schema
psql "$DATABASE_URL" -f db/init.sql

# 2. Ingestion
cd ingestion && npm install && npm start

# 3. API
cd api && npm install && npm start

# 4. Dashboard
cd dashboard && npm install && npm run dev
```

## Configuration

Both services read environment variables from their own `.env` file (copied from
`.env.example`). In docker-compose, `DATABASE_URL` is overridden to point at the
`postgres` service.

### ingestion/.env

| Variable           | Required | Default | Description                                                       |
| ------------------ | -------- | ------- | ----------------------------------------------------------------- |
| `SOROBAN_RPC_URL`  | Yes      | —       | Soroban RPC endpoint (e.g. `https://soroban-testnet.stellar.org`) |
| `CONTRACT_IDS`     | Yes      | —       | Comma-separated list of contract IDs to index                     |
| `POLL_INTERVAL_MS` | No       | `5000`  | How often to poll RPC for new events, in milliseconds             |
| `DATABASE_URL`     | No       | —       | Postgres connection string (set by docker-compose in local dev)   |

The service exits immediately at startup if `SOROBAN_RPC_URL` or `CONTRACT_IDS`
is missing.

### api/.env

| Variable       | Required | Default | Description                                    |
| -------------- | -------- | ------- | ---------------------------------------------- |
| `PORT`         | No       | `4000`  | API listen port                                |
| `DATABASE_URL` | Yes      | —       | Postgres connection string (same as ingestion) |

### dashboard

The dashboard reads `VITE_API_URL` (default `http://localhost:4000`), set in
`docker-compose.yml` or in a local `.env` file.

## API reference

All endpoints are under the `/v1/` prefix. See [docs/api.md](docs/api.md) for
full request/response examples.

| Endpoint                          | Description                                      |
| --------------------------------- | ------------------------------------------------ |
| `GET /v1/health`                  | Health check (includes DB connectivity)          |
| `GET /v1/events`                  | List events with optional filters and pagination |
| `GET /v1/events/:id`              | Get a single event by ID                         |
| `GET /v1/events/volume?contract=` | Event counts per hour for charting               |

`/health` is also available as a redirect alias for `/v1/health`.

`GET /v1/events` accepts `contract`, `type`, `from`, `to`, `limit` (default 50,
max 200), and `offset`. Responses are `{ data, pagination }`; an empty result set
is `200` with `data: []`, not an error.

```bash
curl "http://localhost:4000/v1/events?contract=CBQH...&type=payment&limit=10"
```

The API is read-only and rate-limited to 120 requests/minute per IP by default
(see `api/src/index.js`). Adjust for your deployment.

## Writing an adapter for your contract

This is the main way to plug into the indexer without touching core code:

1. Create `adapters/yourContractAdapter.js` implementing the adapter interface
   (`name`, `contractIds`, optional `canDecode`, required `decode`).
2. Import and add it to the `adapters` array in `adapters/index.js`.
3. Add your contract ID to `CONTRACT_IDS` in `ingestion/.env`.
4. Add a test in `adapters/__tests__/`.

See **[docs/writing-an-adapter.md](docs/writing-an-adapter.md)** for a full
walkthrough, including how to find your contract's real event shape from its Rust
`env.events().publish(...)` calls. `adapters/paymentAdapter.js` is a working
example you can copy.

If you skip this step, events from your contract still get indexed — they just
land in the `generic` adapter undecoded, and can be decoded retroactively later
without re-ingesting.

## Dashboard

A deliberately minimal React/Vite app that lists recent events and charts hourly
volume by calling `GET /v1/events` and `GET /v1/events/volume`. It exists to
prove the pipeline end to end and to serve as a starting point — treat it as
example code, not a production UI.

Point it at a contract with `VITE_API_URL` and make sure that contract appears in
`CONTRACT_IDS`.

## Running tests

Tests use Node's built-in test runner — no extra framework needed.

```bash
# API tests (mocked, no DB required)
cd api && npm test

# Adapter unit tests
node --test adapters/__tests__/*.test.js

# Ingestion tests (DB tests require a running Postgres)
cd ingestion && TEST_DATABASE_URL=postgres://indexer:indexer@localhost:5432/soroban_indexer npm test
```

CI (`.github/workflows/ci.yml`) runs all three suites against a Postgres service
container on every push and pull request, plus a non-blocking Prettier check.

## Repo layout

```
/ingestion   — event listener + writer service
/api         — query layer
/adapters    — per-contract event-decoding modules (shared by ingestion + api)
/dashboard   — example consumer (React/Vite)
/db          — Postgres schema/init scripts
/docs        — architecture notes and deployment guide
```

## Scope and roadmap

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

Known v1 limitations worth knowing before you deploy:

- **No backfill tooling.** If ingestion is down long enough to fall outside
  `MAX_LEDGERS_PER_POLL` (10,000 ledgers), that gap must be filled manually.
- **Single ingestion instance per contract set.** There is no distributed
  locking; running two ingestion replicas against the same contracts is
  harmless (the unique constraint dedupes) but wasteful.
- **No RPC backoff.** Rate limits and transient RPC errors are logged and
  retried on the next tick rather than backed off, so tune `POLL_INTERVAL_MS` or
  split contracts across instances if you hit them often.

## Deployment and scaling

For self-hosting on a VPS, Docker, or k8s — including testnet vs mainnet
settings, monitoring guidance, and scaling notes — see
[docs/deployment.md](docs/deployment.md).

The short version: the API is stateless and can be replicated behind a load
balancer; ingestion should run as a single instance per contract set; and for
production you should use a managed Postgres rather than the compose container.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, testing, code style, and how
to submit a PR.

The main way to contribute is by writing an adapter for your contract — see
[docs/writing-an-adapter.md](docs/writing-an-adapter.md). Issues and PRs are
welcome.

## License

See [LICENSE](LICENSE).
