const SERVICE = "ingestion";

export function log(message, meta = {}) {
  console.log(JSON.stringify({ level: "info", service: SERVICE, message, ...meta }));
}

export function logError(message, err, meta = {}) {
  console.error(
    JSON.stringify({
      level: "error",
      service: SERVICE,
      message,
      error: err?.message ?? String(err),
      ...meta,
    }),
  );
}
