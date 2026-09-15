import { test } from "node:test";
import assert from "node:assert/strict";
import { jsonSafe } from "../db.js";

test("jsonSafe converts top-level BigInt to string", () => {
  assert.equal(jsonSafe(1000000n), "1000000");
});

test("jsonSafe converts nested BigInt values to strings", () => {
  const input = {
    amount: 13721n,
    topics: ["fee", 42n],
    nested: { deep: { value: 999999999999n } },
  };

  const output = jsonSafe(input);

  assert.deepEqual(output, {
    amount: "13721",
    topics: ["fee", "42"],
    nested: { deep: { value: "999999999999" } },
  });
  // And it must now be JSON-serializable:
  assert.doesNotThrow(() => JSON.stringify(output));
});

test("jsonSafe leaves non-BigInt values untouched", () => {
  const input = {
    s: "text",
    n: 123,
    b: true,
    z: null,
    arr: [1, "two"],
    obj: { k: "v" },
  };

  assert.deepEqual(jsonSafe(input), input);
  assert.equal(jsonSafe(undefined), undefined);
});
