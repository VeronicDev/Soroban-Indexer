import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { pool } from "./db.js";
import { eventsRouter } from "./routes/events.js";
import { log, logError } from "./logger.js";

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120, // 120 requests/minute per IP - generous default, tune per deployment
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.get("/v1/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    logError("health check failed", err);
    res.status(503).json({ status: "error", db: "disconnected" });
  }
});

app.use("/v1/events", eventsRouter);

// Backward-compatible alias: /health → /v1/health
app.get("/health", (_req, res) => res.redirect("/v1/health"));

app.use((_req, res) => res.status(404).json({ error: "not_found" }));

const server = app.listen(PORT, () => {
  log(`listening on port ${PORT}`);
});

// ── Graceful shutdown ──────────────────────────────────────────

function shutdown(signal) {
  log(`received ${signal}, shutting down`);
  server.close(async () => {
    await pool.end();
    log("closed all connections");
    process.exit(0);
  });

  // Force-kill after 10s if graceful shutdown stalls
  setTimeout(() => {
    logError("forced shutdown after timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
