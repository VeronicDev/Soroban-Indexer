import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function getCheckpoint(contractId) {
  const { rows } = await pool.query(
    `SELECT last_ledger_seen FROM ingestion_checkpoints WHERE contract_id = $1`,
    [contractId],
  );
  return rows.length > 0 ? Number(rows[0].last_ledger_seen) : 0;
}

export async function setCheckpoint(contractId, lastLedgerSeen) {
  await pool.query(
    `INSERT INTO ingestion_checkpoints (contract_id, last_ledger_seen, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (contract_id)
     DO UPDATE SET last_ledger_seen = EXCLUDED.last_ledger_seen, updated_at = now()`,
    [contractId, lastLedgerSeen],
  );
}

export async function insertRawEvent(event) {
  const {
    contractId,
    eventType,
    ledgerSequence,
    txHash,
    ledgerCloseTime,
    topics,
    value,
    rawPayload,
  } = event;

  const { rows } = await pool.query(
    `INSERT INTO raw_events
       (contract_id, event_type, ledger_sequence, tx_hash, ledger_close_time, topics, value, raw_payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (contract_id, ledger_sequence, tx_hash, event_type) DO NOTHING
     RETURNING id`,
    [
      contractId,
      eventType,
      ledgerSequence,
      txHash,
      ledgerCloseTime,
      JSON.stringify(topics ?? null),
      JSON.stringify(value ?? null),
      JSON.stringify(rawPayload),
    ],
  );

  // rows is empty when ON CONFLICT DO NOTHING skipped an existing row.
  // node-postgres parses int8 (BIGSERIAL) as a string, so normalize to a
  // number — matching getCheckpoint above — to keep the id type consistent.
  return rows[0] ? Number(rows[0].id) : null;
}

export async function insertDecodedEvent({
  rawEventId,
  contractId,
  adapterName,
  eventType,
  decoded,
}) {
  await pool.query(
    `INSERT INTO decoded_events (raw_event_id, contract_id, adapter_name, event_type, decoded)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (raw_event_id, adapter_name) DO NOTHING`,
    [rawEventId, contractId, adapterName, eventType ?? null, JSON.stringify(decoded)],
  );
}
