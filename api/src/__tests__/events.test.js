import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { pool } from "../db.js";
import { eventsRouter } from "../routes/events.js";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/events", eventsRouter);
  return app;
}

test("GET /events returns paginated data shape", async (t) => {
  t.mock.method(pool, "query", async () => ({
    rows: [
      { id: 1, contract_id: "CTEST", event_type: "payment", ledger_sequence: 100 },
    ],
  }));

  const app = buildApp();
  const res = await request(app).get("/events?contract=CTEST&limit=10");

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.pagination.limit, 10);
  assert.equal(res.body.pagination.count, 1);
});

test("GET /events with no matches returns an empty array, not an error", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [] }));

  const app = buildApp();
  const res = await request(app).get("/events?contract=CDOESNOTEXIST");

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, []);
});

test("GET /events/:id returns 404 for a missing event", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [] }));

  const app = buildApp();
  const res = await request(app).get("/events/999999");

  assert.equal(res.status, 404);
});

test("GET /events/:id rejects a non-integer id", async () => {
  const app = buildApp();
  const res = await request(app).get("/events/not-a-number");

  assert.equal(res.status, 400);
});

test("GET /events/volume requires a contract query param", async () => {
  const app = buildApp();
  const res = await request(app).get("/events/volume");

  assert.equal(res.status, 400);
});
