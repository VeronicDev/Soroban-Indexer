/**
 * Fallback adapter used when no contract-specific adapter matches a raw event.
 * Stores the event's topics/value as-is under a generic shape, so nothing is
 * silently dropped just because a dedicated adapter hasn't been written yet.
 */
export const genericAdapter = {
  name: "generic",
  contractIds: [], // matches nothing directly; used as the default fallback

  decode(rawEvent) {
    return {
      kind: "undecoded",
      contract_id: rawEvent.contract_id,
      event_type: rawEvent.event_type ?? null,
      topics: rawEvent.topics ?? null,
      value: rawEvent.value ?? null,
    };
  },
};
