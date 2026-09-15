import "dotenv/config";
import { createServer, pollContract } from "./rpcListener.js";
import { createRetryTracker } from "./backoff.js";
import { log, logError } from "./logger.js";

const RPC_URL = process.env.SOROBAN_RPC_URL;
const CONTRACT_IDS = (process.env.CONTRACT_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 5000);
const RETRY_BASE_MS = Number(process.env.RETRY_BASE_MS ?? 1000);
const RETRY_MAX_MS = Number(process.env.RETRY_MAX_MS ?? 300_000);

if (!RPC_URL) {
  console.error("SOROBAN_RPC_URL is required");
  process.exit(1);
}
if (CONTRACT_IDS.length === 0) {
  console.error("CONTRACT_IDS is required (comma-separated list)");
  process.exit(1);
}

const server = createServer(RPC_URL);
const retryTracker = createRetryTracker({ baseMs: RETRY_BASE_MS, maxMs: RETRY_MAX_MS });

let shuttingDown = false;
process.on("SIGTERM", () => (shuttingDown = true));
process.on("SIGINT", () => (shuttingDown = true));

async function pollLoop() {
  log(`starting, watching ${CONTRACT_IDS.length} contract(s)`);

  while (!shuttingDown) {
    for (const contractId of CONTRACT_IDS) {
      // Skip contracts still inside their backoff window. Backoff is tracked
      // per contract, so one throttled endpoint doesn't delay the others.
      if (!retryTracker.shouldAttempt(contractId)) {
        continue;
      }

      try {
        const written = await pollContract(server, contractId);
        if (written > 0) {
          log(`${contractId}: wrote ${written} new event(s)`, {
            contract_id: contractId,
            count: written,
          });
        }
        retryTracker.recordSuccess(contractId);
      } catch (err) {
        // Don't crash the whole loop on a transient RPC hiccup (network blip,
        // RPC provider rate limit, etc). Transient failures back off
        // exponentially; the checkpoint still ensures no gap or duplicate.
        const failure = retryTracker.recordFailure(contractId, err);
        logError(`error polling ${contractId}`, err, {
          contract_id: contractId,
          retryable: failure.retryable,
          reason: failure.reason,
          status: failure.status,
          rpc_code: failure.rpcCode,
          attempt: failure.attempt,
          retry_in_ms: failure.delayMs,
        });
      }
    }

    await sleep(POLL_INTERVAL_MS);
  }

  log("shutting down cleanly");
  process.exit(0);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

pollLoop();
