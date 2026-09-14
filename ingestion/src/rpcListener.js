import { rpc as SorobanRpc, scValToNative } from "@stellar/stellar-sdk";
import { getCheckpoint, setCheckpoint, insertRawEvent, insertDecodedEvent } from "./db.js";
import { findAdapter } from "../../adapters/index.js";

const MAX_LEDGERS_PER_POLL = 10000; // RPC providers typically cap the event-fetch window

export function createServer(rpcUrl) {
  return new SorobanRpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
}

/**
 * Fetch and persist events for a single contract, starting after its last
 * checkpoint. Returns the number of raw events written.
 */
export async function pollContract(server, contractId) {
  const latestLedger = (await server.getLatestLedger()).sequence;
  const lastSeen = await getCheckpoint(contractId);

  const startLedger = Math.max(
    lastSeen + 1,
    latestLedger - MAX_LEDGERS_PER_POLL // avoid requesting a window the RPC provider will reject
  );

  if (startLedger > latestLedger) {
    return 0; // nothing new
  }

  let cursor;
  let writtenCount = 0;
  let highestLedgerThisPoll = lastSeen;

  do {
    const response = await server.getEvents({
      startLedger: cursor ? undefined : startLedger,
      cursor,
      filters: [
        {
          type: "contract",
          contractIds: [contractId],
        },
      ],
      limit: 100,
    });

    for (const evt of response.events) {
      const decodedTopics = (evt.topic ?? []).map((t) => safeScValToNative(t));
      const decodedValue = safeScValToNative(evt.value);

      const rawEventId = await insertRawEvent({
        contractId,
        eventType: decodedTopics[0] ?? null,
        ledgerSequence: evt.ledger,
        txHash: evt.txHash,
        ledgerCloseTime: evt.ledgerClosedAt ? new Date(evt.ledgerClosedAt) : null,
        topics: decodedTopics,
        value: decodedValue,
        rawPayload: evt,
      });

      if (rawEventId) {
        writtenCount += 1;

        const adapter = findAdapter({
          contract_id: contractId,
          topics: decodedTopics,
          value: decodedValue,
        });

        const decoded = adapter.decode({
          contract_id: contractId,
          event_type: decodedTopics[0] ?? null,
          topics: decodedTopics,
          value: decodedValue,
          ledger_sequence: evt.ledger,
        });

        await insertDecodedEvent({
          rawEventId,
          contractId,
          adapterName: adapter.name,
          eventType: decodedTopics[0] ?? null,
          decoded,
        });
      }

      highestLedgerThisPoll = Math.max(highestLedgerThisPoll, evt.ledger);
    }

    cursor = response.events.length > 0 ? response.cursor : undefined;
  } while (cursor);

  if (highestLedgerThisPoll > lastSeen) {
    await setCheckpoint(contractId, highestLedgerThisPoll);
  }

  return writtenCount;
}

function safeScValToNative(scVal) {
  if (scVal === undefined || scVal === null) return null;
  try {
    return scValToNative(scVal);
  } catch {
    // Fall back to storing the raw ScVal representation if native conversion
    // fails for a type this version of the SDK doesn't handle.
    return scVal;
  }
}
