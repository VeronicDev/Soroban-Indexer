import { test } from "node:test";
import assert from "node:assert/strict";
import { parseListParams, validateDateParams } from "../db.js";

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

test("parseListParams clamps negative limit to 1", () => {
  const { limit } = parseListParams({ limit: "-10" });
  assert.equal(limit, 1);
});

test("validateDateParams accepts valid ISO dates", () => {
  assert.equal(validateDateParams("2026-01-01T00:00:00Z", "2026-02-01"), null);
  assert.equal(validateDateParams(undefined, undefined), null);
});

test("validateDateParams rejects invalid dates", () => {
  assert.match(validateDateParams("not-a-date", undefined), /from/);
  assert.match(validateDateParams(undefined, "31/31/2026"), /to/);
});
