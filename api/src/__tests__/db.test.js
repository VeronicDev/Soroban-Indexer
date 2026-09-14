import { test } from "node:test";
import assert from "node:assert/strict";
import { parseListParams } from "../db.js";

test("parseListParams applies defaults when nothing is provided", () => {
  const { limit, offset } = parseListParams({});
  assert.equal(limit, 50);
  assert.equal(offset, 0);
});

test("parseListParams caps limit at MAX_LIMIT", () => {
  const { limit } = parseListParams({ limit: "99999" });
  assert.equal(limit, 200);
});

test("parseListParams rejects negative offset", () => {
  const { offset } = parseListParams({ offset: "-50" });
  assert.equal(offset, 0);
});

test("parseListParams passes through valid values", () => {
  const { limit, offset } = parseListParams({ limit: "25", offset: "10" });
  assert.equal(limit, 25);
  assert.equal(offset, 10);
});
