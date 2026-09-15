import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

export function parseListParams(query) {
  const limit = Math.min(Number(query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
  const offset = Math.max(Number(query.offset) || 0, 0);
  return { limit, offset };
}

/**
 * List decoded events (falling back to raw payload when no adapter decoded
 * them), optionally filtered by contract, event type, and time range.
 */
export async function listEvents({ contract, type, from, to, limit, offset }) {
  const conditions = [];
  const params = [];

  if (contract) {
    params.push(contract);
    conditions.push(`r.contract_id = $${params.length}`);
  }
  if (type) {
    params.push(type);
    conditions.push(`r.event_type = $${params.length}`);
  }
  if (from) {
    params.push(new Date(from));
    conditions.push(`r.ledger_close_time >= $${params.length}`);
  }
  if (to) {
    params.push(new Date(to));
    conditions.push(`r.ledger_close_time <= $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  params.push(limit);
  const limitParamIndex = params.length;
  params.push(offset);
  const offsetParamIndex = params.length;

  const { rows } = await pool.query(
    `SELECT
       r.id, r.contract_id, r.event_type, r.ledger_sequence, r.tx_hash,
       r.ledger_close_time, r.topics, r.value,
       d.adapter_name, d.decoded
     FROM raw_events r
     LEFT JOIN decoded_events d ON d.raw_event_id = r.id
     ${whereClause}
     ORDER BY r.ledger_sequence DESC, r.id DESC
     LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`,
    params,
  );

  return rows;
}

export async function getEventById(id) {
  const { rows } = await pool.query(
    `SELECT
       r.id, r.contract_id, r.event_type, r.ledger_sequence, r.tx_hash,
       r.ledger_close_time, r.topics, r.value, r.raw_payload,
       d.adapter_name, d.decoded
     FROM raw_events r
     LEFT JOIN decoded_events d ON d.raw_event_id = r.id
     WHERE r.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Event volume over time for a contract, bucketed by hour — used by the
 * example dashboard's chart.
 */
export async function eventVolumeByHour(contractId) {
  const { rows } = await pool.query(
    `SELECT date_trunc('hour', ledger_close_time) AS bucket, count(*) AS count
     FROM raw_events
     WHERE contract_id = $1 AND ledger_close_time IS NOT NULL
     GROUP BY bucket
     ORDER BY bucket ASC`,
    [contractId],
  );
  return rows;
}
