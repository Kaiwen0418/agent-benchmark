import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { createCommandBackbone, partitionForKey } from "./command-backbone.js";

const redisUrl = process.env.REDIS_TEST_URL;

test("Redis Stream command backbone processes and deduplicates commands", { skip: !redisUrl }, async () => {
  const namespace = crypto.randomUUID();
  let handled = 0;
  const backbone = createCommandBackbone({
    redisUrl: redisUrl!,
    streamKey: `test:orchestrator:commands:${namespace}`,
    groupName: `test-group:${namespace}`,
    responseTimeoutSeconds: 3,
    handler: async (type, payload) => {
      handled += 1;
      return { statusCode: 201, body: { type, payload } };
    },
  });

  await backbone.start();
  try {
    const commandId = crypto.randomUUID();
    const first = await backbone.execute("session.snapshot", { token: "tok-1" }, "tok-1", commandId);
    const duplicate = await backbone.execute("session.snapshot", { token: "tok-1" }, "tok-1", commandId);

    assert.deepEqual(first, {
      statusCode: 201,
      body: { type: "session.snapshot", payload: { token: "tok-1" } },
    });
    assert.deepEqual(duplicate, first);
    assert.equal(handled, 1);
  } finally {
    await backbone.stop();
  }
});

test("partitioned workers keep one entity serial and route distinct partitions independently", { skip: !redisUrl }, async () => {
  const namespace = crypto.randomUUID();
  const baseOptions = {
    redisUrl: redisUrl!,
    streamKey: `test:orchestrator:partitioned:${namespace}`,
    groupName: `test-group:${namespace}`,
    partitionCount: 2,
    responseTimeoutSeconds: 3,
  };
  const handledBy: Array<{ worker: number; key: string }> = [];
  let active = 0;
  let maxActive = 0;
  const makeHandler = (worker: number) => async (_type: string, payload: Record<string, unknown>) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active -= 1;
    handledBy.push({ worker, key: String(payload.key) });
    return { statusCode: 200, body: { worker } };
  };
  const worker0 = createCommandBackbone({
    ...baseOptions,
    role: "worker",
    assignedPartitions: [0],
    handler: makeHandler(0),
  });
  const worker1 = createCommandBackbone({
    ...baseOptions,
    role: "worker",
    assignedPartitions: [1],
    handler: makeHandler(1),
  });
  const api = createCommandBackbone({
    ...baseOptions,
    role: "api",
    handler: async () => ({ statusCode: 500, body: {} }),
  });
  const keyForPartition = (partition: number) => {
    for (let index = 0; ; index += 1) {
      const key = `entity-${partition}-${index}`;
      if (partitionForKey(key, 2) === partition) {
        return key;
      }
    }
  };
  const partition0Key = keyForPartition(0);
  const partition1Key = keyForPartition(1);

  await Promise.all([worker0.start(), worker1.start(), api.start()]);
  try {
    const responses = await Promise.all([
      api.execute("test", { key: partition0Key }, partition0Key),
      api.execute("test", { key: partition0Key }, partition0Key),
      api.execute("test", { key: partition1Key }, partition1Key),
    ]);
    assert.deepEqual(responses.map((response) => response.statusCode), [200, 200, 200]);
    assert.deepEqual(
      handledBy.filter((entry) => entry.key === partition0Key).map((entry) => entry.worker),
      [0, 0],
    );
    assert.deepEqual(
      handledBy.filter((entry) => entry.key === partition1Key).map((entry) => entry.worker),
      [1],
    );
    assert.equal(maxActive, 2);
  } finally {
    await Promise.all([worker0.stop(), worker1.stop(), api.stop()]);
  }
});

test("a partition lease rejects overlapping worker assignments", { skip: !redisUrl }, async () => {
  const namespace = crypto.randomUUID();
  const options = {
    redisUrl: redisUrl!,
    streamKey: `test:orchestrator:lease:${namespace}`,
    groupName: `test-group:${namespace}`,
    partitionCount: 1,
    role: "worker" as const,
    assignedPartitions: [0],
    handler: async () => ({ statusCode: 200, body: {} }),
  };
  const first = createCommandBackbone(options);
  const overlapping = createCommandBackbone(options);

  await first.start();
  try {
    await assert.rejects(() => overlapping.start(), /already assigned/);
  } finally {
    await Promise.all([first.stop(), overlapping.stop()]);
  }
});
