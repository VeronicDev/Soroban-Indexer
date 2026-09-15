import "dotenv/config";
import { createServer, pollContract } from "./rpcListener.js";
import { log, logError } from "./logger.js";

const RPC_URL = process.env.SOROBAN_RPC_URL;
const CONTRACT_IDS = (process.env.CONTRACT_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 5000);

if (!RPC_URL) {
  console.error("SOROBAN_RPC_URL is required");
  process.exit(1);
}
if (CONTRACT_IDS.length === 0) {
  console.error("CONTRACT_IDS is required (comma-separated list)");
  process.exit(1);
}

const server = createServer(RPC_URL);

let shuttingDown = false;
process.on("SIGTERM", () => (shuttingDown = true));
process.on("SIGINT", () => (shuttingDown = true));

async function pollLoop() {
  log(`starting, watching ${CONTRACT_IDS.length} contract(s)`);

  while (!shuttingDown) {
    for (const contractId of CONTRACT_IDS) {
      try {
        const written = await pollContract(server, contractId);
        if (written > 0) {
          log(`${contractId}: wrote ${written} new event(s)`, {
            contract_id: contractId,
            count: written,
          });
        }
      } catch (err) {
        // Reconnection/retry: don't crash the whole loop on a transient RPC
        // hiccup (network blip, RPC provider rate limit, etc). Just log and
        // retry on the next tick — the checkpoint ensures no gap/duplicate.
        logError(`error polling ${contractId}`, err, { contract_id: contractId });
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
