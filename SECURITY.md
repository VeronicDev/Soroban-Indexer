# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in this project, please report it
responsibly. **Do not open a public GitHub issue for security vulnerabilities.**

Instead, please email the maintainer directly or use GitHub's private
vulnerability reporting feature (Settings → Security → "Report a vulnerability").

We will acknowledge receipt within 48 hours and aim to provide a fix or
mitigation plan within 7 days.

## Scope

This project is a self-hostable event indexer for Soroban smart contracts.
Security-relevant areas include:

- **Database access**: The API and ingestion services connect to Postgres.
  Ensure `DATABASE_URL` credentials are not exposed in logs or error responses.
- **RPC endpoint**: The ingestion service connects to a Soroban RPC provider.
  Ensure `SOROBAN_RPC_URL` is not leaked.
- **Input validation**: The API accepts query parameters that are passed to
  Postgres queries. Parameterized queries are used throughout to prevent SQL
  injection.
- **Docker configuration**: Default credentials in `docker-compose.yml` are
  for local development only. Change them before any production deployment.

## Recommended production hardening

- Change all default Postgres credentials
- Run behind a reverse proxy with TLS termination
- Restrict CORS origins to your known dashboard domain
- Use environment variables or a secrets manager for all credentials
- Enable Postgres SSL connections for remote databases

## Dependency updates

Dependencies are pinned in `package-lock.json` files. Run `npm audit`
regularly and update vulnerable packages promptly.
