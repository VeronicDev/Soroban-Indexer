import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import { eventsRouter } from "./routes/events.js";

const PORT = process.env.PORT || 4000;

const app = express();
app.use(express.json());

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120, // 120 requests/minute per IP - generous default, tune per deployment
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/events", eventsRouter);

app.use((_req, res) => res.status(404).json({ error: "not_found" }));

app.listen(PORT, () => {
  console.log(`[api] listening on port ${PORT}`);
});
