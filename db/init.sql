-- Raw events as ingested straight from Soroban RPC, undecoded.
CREATE TABLE IF NOT EXISTS raw_events (
    id              BIGSERIAL PRIMARY KEY,
    contract_id     TEXT NOT NULL,
    event_type      TEXT,
    ledger_sequence BIGINT NOT NULL,
    tx_hash         TEXT,
    ledger_close_time TIMESTAMPTZ,
    topics          JSONB,
    value           JSONB,
    raw_payload     JSONB NOT NULL,
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (contract_id, ledger_sequence, tx_hash, event_type)
);

CREATE INDEX IF NOT EXISTS idx_raw_events_contract ON raw_events (contract_id);
CREATE INDEX IF NOT EXISTS idx_raw_events_ledger ON raw_events (ledger_sequence);
CREATE INDEX IF NOT EXISTS idx_raw_events_close_time ON raw_events (ledger_close_time);

-- Decoded events, produced by an adapter from a raw_event row.
-- `decoded` holds the adapter-specific structured schema.
CREATE TABLE IF NOT EXISTS decoded_events (
    id              BIGSERIAL PRIMARY KEY,
    raw_event_id    BIGINT NOT NULL REFERENCES raw_events(id) ON DELETE CASCADE,
    contract_id     TEXT NOT NULL,
    adapter_name    TEXT NOT NULL,
    event_type      TEXT,
    decoded         JSONB NOT NULL,
    decoded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (raw_event_id, adapter_name)
);

CREATE INDEX IF NOT EXISTS idx_decoded_events_contract ON decoded_events (contract_id);
CREATE INDEX IF NOT EXISTS idx_decoded_events_type ON decoded_events (event_type);

-- Tracks the last ledger sequence successfully processed per contract, so
-- ingestion can resume without gaps or duplicates after a restart.
CREATE TABLE IF NOT EXISTS ingestion_checkpoints (
    contract_id       TEXT PRIMARY KEY,
    last_ledger_seen  BIGINT NOT NULL DEFAULT 0,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
