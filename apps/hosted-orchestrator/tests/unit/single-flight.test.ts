import assert from "node:assert/strict";
import test from "node:test";
import { createSingleFlight } from "../../src/single-flight.js";

test("createSingleFlight shares concurrent work for the same key", async () => {
  let calls = 0;
  const run = createSingleFlight({
    key: (value: string) => value,
    run: async (value: string) => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return value.toUpperCase();
    },
  });

  const [first, second] = await Promise.all([run("attempt"), run("attempt")]);

  assert.equal(first, "ATTEMPT");
  assert.equal(second, "ATTEMPT");
  assert.equal(calls, 1);
});

test("createSingleFlight releases failed work for retry", async () => {
  let calls = 0;
  const run = createSingleFlight({
    key: (value: string) => value,
    run: async () => {
      calls += 1;
      if (calls === 1) throw new Error("temporary failure");
      return "recovered";
    },
  });

  await assert.rejects(run("attempt"), /temporary failure/);
  assert.equal(await run("attempt"), "recovered");
  assert.equal(calls, 2);
});
