# Contributing to Soroban Indexer

Thanks for taking a look at the project. This guide covers setup, testing, and how to contribute.

## Quick start

```bash
# Clone and start the full stack (Postgres, ingestion, API, dashboard)
cp ingestion/.env.example ingestion/.env
cp api/.env.example api/.env
# Edit .env files as needed — at minimum set SOROBAN_RPC_URL

docker compose up --build
```

- **API**: http://localhost:4000/v1/health
- **Dashboard**: http://localhost:5173

## Running tests

Tests use Node's built-in test runner — no extra framework needed.

```bash
# API tests (mocked, no DB required)
cd api && npm test

# Adapter unit tests
node --test adapters/__tests__/*.test.js

# Ingestion DB tests (requires a running Postgres instance)
cd ingestion && TEST_DATABASE_URL=postgres://indexer:indexer@localhost:5432/soroban_indexer npm test
```

## Project layout

```
/ingestion   — polls Soroban RPC, writes to Postgres
/api         — REST query layer
/adapters    — per-contract event-decoding modules (shared by ingestion + api)
/dashboard   — example consumer (React/Vite)
/db          — Postgres schema/init scripts
/docs        — architecture notes
```

## Contributing an adapter

This is the main way to plug into the indexer without touching core code.

See **[docs/writing-an-adapter.md](docs/writing-an-adapter.md)** for a full walkthrough. In short:

1. Create `adapters/yourContractAdapter.js` implementing the adapter interface.
2. Import and register it in `adapters/index.js`.
3. Add your contract ID to `CONTRACT_IDS` in `ingestion/.env`.
4. Add a test in `adapters/__tests__/`.

## Code style

- ES modules (`"type": "module"`) throughout.
- Use `const`/`let`, no `var`.
- Prefer explicit `async`/`await` over raw promises.
- Keep functions small and single-purpose.
- Use structured JSON logging (see `api/src/logger.js`) for new services.

## Submitting a PR

1. Fork the repo and create a branch from `main`.
2. Make your changes, add tests.
3. Run the relevant test suite and confirm it passes.
4. Open a PR against `main` with a clear description of what changed and why.
5. For adapters: include which contract you tested against and how.

## Questions?

Open a GitHub issue — we're happy to help.
