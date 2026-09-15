import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cors from "cors";
import request from "supertest";
import { pool } from "../db.js";
import { eventsRouter } from "../routes/events.js";

function buildApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/v1/events", eventsRouter);
  return app;
}

test("GET /v1/events returns paginated data shape", async (t) => {
  t.mock.method(pool, "query", async () => ({
    rows: [{ id: 1, contract_id: "CTEST", event_type: "payment", ledger_sequence: 100 }],
  }));

  const app = buildApp();
  const res = await request(app).get("/v1/events?contract=CTEST&limit=10");

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.pagination.limit, 10);
  assert.equal(res.body.pagination.count, 1);
});

test("GET /v1/events with no matches returns an empty array, not an error", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [] }));

  const app = buildApp();
  const res = await request(app).get("/v1/events?contract=CDOESNOTEXIST");

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, []);
});

test("GET /v1/events/:id returns 404 for a missing event", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [] }));

  const app = buildApp();
  const res = await request(app).get("/v1/events/999999");

  assert.equal(res.status, 404);
});

test("GET /v1/events/:id rejects a non-integer id", async () => {
  const app = buildApp();
  const res = await request(app).get("/v1/events/not-a-number");

  assert.equal(res.status, 400);
});

test("GET /v1/events/volume requires a contract query param", async () => {
  const app = buildApp();
  const res = await request(app).get("/v1/events/volume");

  assert.equal(res.status, 400);
});

test("GET /v1/health returns ok with connected db", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [] }));

  const app = express();
  app.use(cors());
  app.get("/v1/health", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ok", db: "connected" });
    } catch {
      res.status(503).json({ status: "error", db: "disconnected" });
    }
  });

  const res = await request(app).get("/v1/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
  assert.equal(res.body.db, "connected");
});

test("GET /v1/events includes Access-Control-Allow-Origin header", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [] }));

  const app = buildApp();
  const res = await request(app).get("/v1/events");

  assert.ok(res.headers["access-control-allow-origin"], "should include CORS header");
});
