# Self-hosting deployment guide

This document covers how to run the Soroban Indexer in a self-hosted environment (VPS, Docker, k8s, etc.).

## Prerequisites

- Docker and Docker Compose (for the recommended setup), or Node.js 20+ and a Postgres 14+ instance
- A Soroban RPC endpoint (testnet or mainnet)
- The contract IDs you want to index

## Environment configuration

Copy the example env files and fill in the values:

```bash
cp ingestion/.env.example ingestion/.env
cp api/.env.example api/.env
```

### Ingestion (.env)

| Variable | Required | Description |
|---|---|---|
| `SOROBAN_RPC_URL` | Yes | Soroban RPC endpoint (e.g. `https://soroban-testnet.stellar.org`) |
| `CONTRACT_IDS` | Yes | Comma-separated list of contract IDs to index |
| `POLL_INTERVAL_MS` | No | Polling interval in ms (default: 5000) |
| `DATABASE_URL` | No | Postgres connection string (overridden by docker-compose in local dev) |

### API (.env)

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | API listen port (default: 4000) |
| `DATABASE_URL` | Yes | Postgres connection string (same as ingestion) |

## Running with Docker Compose

The simplest way to run everything:

```bash
docker compose up --build
```

This starts:

| Service | Port | Description |
|---|---|---|
| `postgres` | 5432 | Database (with schema auto-initialized) |
| `ingestion` | — | Polls RPC and writes events |
| `api` | 4000 | REST query layer |
| `dashboard` | 5173 | Example dashboard |

### Running in the background

```bash
docker compose up --build -d
docker compose logs -f ingestion  # watch ingestion logs
```

## Running without Docker

If you prefer to manage services yourself:

1. **Database**: Create a Postgres database and run `db/init.sql` against it.
2. **Ingestion**: `cd ingestion && npm install && npm start`
3. **API**: `cd api && npm install && npm start`
4. **Dashboard**: `cd dashboard && npm install && npm run dev`

Each service reads `DATABASE_URL` (or `SOROBAN_RPC_URL` / `CONTRACT_IDS`) from the environment.

## Testnet vs Mainnet

| | Testnet | Mainnet |
|---|---|---|
| RPC URL | `https://soroban-testnet.stellar.org` | `https://soroban-mainnet.stellar.org` |
| Data volume | Low — good for testing | High — monitor disk usage on Postgres |
| Ingestion lag | Minimal | May fall behind if `MAX_LEDGERS_PER_POLL` is exceeded |

Update `SOROBAN_RPC_URL` in `ingestion/.env` to switch networks.

## Monitoring

### Health check

```bash
curl http://localhost:4000/v1/health
# {"status":"ok","db":"connected"}
```

### Ingestion logs

The ingestion service logs every batch of events written:

```
[ingestion] C_CONTRACT: wrote 12 new event(s)
```

Errors are logged per-contract and don't crash the process:

```
[ingestion] error polling C_CONTRACT: connection timeout
```

### Key things to watch

- **Checkpoint staleness**: If `ingestion_checkpoints.updated_at` stops advancing, the ingestion service is stuck or the RPC endpoint is down.
- **Disk usage**: Postgres grows proportional to event volume. For high-traffic mainnet contracts, set up log rotation or archival for `raw_events`.
- **RPC rate limits**: If you see repeated rate-limit errors, increase `POLL_INTERVAL_MS` or reduce the number of contracts per instance.

## Scaling considerations

- **Single ingestion instance per contract set**: The ingestion service does not use distributed locking. Running multiple instances against the same contracts will cause duplicate processing (harmless due to `ON CONFLICT DO NOTHING`, but wasteful).
- **Read-heavy workloads**: The API is stateless — run multiple replicas behind a load balancer if read throughput is a concern.
- **Database**: For production, use a managed Postgres instance (RDS, Cloud SQL, etc.) rather than the docker-compose Postgres container.
