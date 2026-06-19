import crypto from "node:crypto";
import { createClient } from "redis";

type CommandResponse = {
  statusCode: number;
  body: unknown;
};

type CommandHandler = (type: string, payload: Record<string, unknown>) => Promise<CommandResponse>;
export type CommandBackboneRole = "api" | "worker" | "all";
export type CommandDeadLetter = {
  commandId: string;
  stream: string;
  messageId: string;
  partition: number;
  partitionKey: string | null;
  payloadType: string;
  payload: Record<string, unknown>;
  errorCode: string;
  errorMessage: string;
  attempts: number;
};

type CommandBackboneOptions = {
  redisUrl: string;
  handler: CommandHandler;
  role?: CommandBackboneRole;
  streamKey?: string;
  groupName?: string;
  consumerName?: string;
  partitionCount?: number;
  assignedPartitions?: number[];
  responseTtlSeconds?: number;
  responseTimeoutSeconds?: number;
  maxStreamLength?: number;
  maxCommandAttempts?: number;
  retryBaseDelayMs?: number;
  reclaimIdleMs?: number;
  onDeadLetter?: (deadLetter: CommandDeadLetter) => Promise<void>;
};

type StoredResponse = CommandResponse & {
  commandId: string;
};

export function partitionForKey(key: string, partitionCount: number) {
  const digest = crypto.createHash("sha256").update(key).digest();
  return digest.readUInt32BE(0) % partitionCount;
}

export function createCommandBackbone(options: CommandBackboneOptions) {
  const role = options.role ?? "all";
  const producer = createClient({ url: options.redisUrl });
  const consumer = producer.duplicate();
  const waiter = producer.duplicate();
  const streamKey = options.streamKey ?? "agentbench:orchestrator:commands";
  const groupName = options.groupName ?? "hosted-orchestrator";
  const consumerName = options.consumerName ?? `worker-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
  const partitionCount = Math.max(1, Math.trunc(options.partitionCount ?? 16));
  const assignedPartitions = options.assignedPartitions ?? Array.from({ length: partitionCount }, (_, index) => index);
  const responseTtlSeconds = options.responseTtlSeconds ?? 60;
  const responseTimeoutSeconds = options.responseTimeoutSeconds ?? 30;
  const maxStreamLength = options.maxStreamLength ?? 100_000;
  const maxCommandAttempts = Math.max(1, Math.trunc(options.maxCommandAttempts ?? 3));
  const retryBaseDelayMs = Math.max(0, Math.trunc(options.retryBaseDelayMs ?? 100));
  const reclaimIdleMs = Math.max(1, Math.trunc(options.reclaimIdleMs ?? 30_000));
  let running = false;
  let leaseTimer: ReturnType<typeof setInterval> | null = null;

  if (assignedPartitions.some((partition) => partition < 0 || partition >= partitionCount)) {
    throw new Error(`Worker partitions must be between 0 and ${partitionCount - 1}.`);
  }

  for (const client of [producer, consumer, waiter]) {
    client.on("error", (error) => {
      console.error("[hosted-orchestrator] redis command backbone error", error);
    });
  }

  function streamForPartition(partition: number) {
    return `${streamKey}:p${partition}`;
  }

  function responseKey(commandId: string) {
    return `agentbench:orchestrator:response:${commandId}`;
  }

  function resultKey(commandId: string) {
    return `agentbench:orchestrator:result:${commandId}`;
  }

  function retryKey(commandId: string) {
    return `${streamKey}:retry:${commandId}`;
  }

  function failureKey(commandId: string) {
    return `${streamKey}:failure:${commandId}`;
  }

  function leaseKey(partition: number) {
    return `${streamKey}:lease:${groupName}:p${partition}`;
  }

  async function acquirePartitionLeases() {
    const acquired: number[] = [];
    for (const partition of assignedPartitions) {
      const result = await producer.set(leaseKey(partition), consumerName, { NX: true, EX: 10 });
      if (result !== "OK") {
        for (const ownedPartition of acquired) {
          await producer.del(leaseKey(ownedPartition));
        }
        throw new Error(`Orchestrator partition ${partition} is already assigned to another worker.`);
      }
      acquired.push(partition);
    }
  }

  async function renewPartitionLeases() {
    for (const partition of assignedPartitions) {
      const renewed = await producer.eval(
        "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('EXPIRE', KEYS[1], ARGV[2]) else return 0 end",
        { keys: [leaseKey(partition)], arguments: [consumerName, "10"] },
      );
      if (renewed !== 1) {
        throw new Error(`Lost orchestrator partition lease ${partition}.`);
      }
    }
  }

  async function releasePartitionLeases() {
    for (const partition of assignedPartitions) {
      await producer.eval(
        "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
        { keys: [leaseKey(partition)], arguments: [consumerName] },
      );
    }
  }

  async function ensureGroups() {
    for (const partition of assignedPartitions) {
      try {
        await producer.xGroupCreate(streamForPartition(partition), groupName, "0", { MKSTREAM: true });
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("BUSYGROUP")) {
          throw error;
        }
      }
    }
  }

  async function publishResponse(response: StoredResponse) {
    const key = responseKey(response.commandId);
    await producer.lPush(key, JSON.stringify(response));
    await producer.expire(key, responseTtlSeconds);
  }

  async function processMessage(stream: string, id: string, message: Record<string, string>) {
    const commandId = message.commandId;
    const type = message.type;
    if (!commandId || !type) {
      await consumer.xAck(stream, groupName, id);
      return;
    }

    const stored = await producer.get(resultKey(commandId));
    if (stored) {
      await publishResponse(JSON.parse(stored) as StoredResponse);
      await consumer.xAck(stream, groupName, id);
      return;
    }

    let response: StoredResponse | null = null;
    let payload: Record<string, unknown> = {};
    const persistedAttempts = Number(await producer.get(retryKey(commandId)) ?? 0);
    if (persistedAttempts >= maxCommandAttempts) {
      try {
        payload = JSON.parse(message.payload ?? "{}") as Record<string, unknown>;
      } catch {
        payload = {};
      }
      const storedFailure = JSON.parse(
        await producer.get(failureKey(commandId)) ?? '{"errorCode":"command_handler_error","errorMessage":"Command failed"}',
      ) as { errorCode: string; errorMessage: string };
      await options.onDeadLetter?.({
        commandId,
        stream,
        messageId: id,
        partition: Number(stream.match(/:p(\d+)$/)?.[1] ?? 0),
        partitionKey: message.partitionKey ?? null,
        payloadType: type,
        payload,
        errorCode: storedFailure.errorCode,
        errorMessage: storedFailure.errorMessage,
        attempts: persistedAttempts,
      });
      response = {
        commandId,
        statusCode: 500,
        body: { error: "orchestrator_command_dead_lettered", commandId, attempts: persistedAttempts },
      };
    }
    while (!response) {
      try {
        payload = JSON.parse(message.payload ?? "{}") as Record<string, unknown>;
        response = { commandId, ...(await options.handler(type, payload)) };
        await producer.del([retryKey(commandId), failureKey(commandId)]);
      } catch (error) {
        const attempts = await producer.incr(retryKey(commandId));
        await producer.expire(retryKey(commandId), 24 * 60 * 60);
        if (attempts < maxCommandAttempts) {
          await new Promise((resolve) => setTimeout(resolve, retryBaseDelayMs * 2 ** (attempts - 1)));
          continue;
        }

        const errorMessage = error instanceof Error ? error.message : "Command failed";
        const errorCode = error instanceof Error && error.name ? error.name : "command_handler_error";
        await producer.set(failureKey(commandId), JSON.stringify({ errorCode, errorMessage }), { EX: 24 * 60 * 60 });
        await options.onDeadLetter?.({
          commandId,
          stream,
          messageId: id,
          partition: Number(stream.match(/:p(\d+)$/)?.[1] ?? 0),
          partitionKey: message.partitionKey ?? null,
          payloadType: type,
          payload,
          errorCode,
          errorMessage,
          attempts,
        });
        response = {
          commandId,
          statusCode: 500,
          body: { error: "orchestrator_command_dead_lettered", commandId, attempts },
        };
      }
    }

    await producer.del([retryKey(commandId), failureKey(commandId)]);

    await producer.set(resultKey(commandId), JSON.stringify(response), { EX: 24 * 60 * 60 });
    await publishResponse(response);
    await consumer.xAck(stream, groupName, id);
  }

  async function reclaimStaleMessages() {
    for (const partition of assignedPartitions) {
      const stream = streamForPartition(partition);
      const claimed = await consumer.xAutoClaim(stream, groupName, consumerName, reclaimIdleMs, "0-0", { COUNT: 16 });
      for (const entry of claimed.messages) {
        if (entry) {
          await processMessage(stream, entry.id, entry.message);
        }
      }
    }
  }

  async function consume() {
    const streams = assignedPartitions.map((partition) => ({ key: streamForPartition(partition), id: ">" }));
    while (running) {
      try {
        await reclaimStaleMessages();
        const replies = await consumer.xReadGroup(groupName, consumerName, streams, { COUNT: 16, BLOCK: 1_000 });
        for (const stream of replies ?? []) {
          for (const entry of stream.messages) {
            await processMessage(stream.name, entry.id, entry.message);
          }
        }
      } catch (error) {
        if (running) {
          console.error("[hosted-orchestrator] command consumer failed", error);
          if (error instanceof Error && error.message.startsWith("Lost orchestrator partition lease")) {
            running = false;
            process.exitCode = 1;
            setTimeout(() => process.exit(1), 0);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }
  }

  return {
    async start() {
      if (running) {
        return;
      }
      const clients = role === "api" ? [producer, waiter] : role === "worker" ? [producer, consumer] : [producer, consumer, waiter];
      await Promise.all(clients.map((client) => client.connect()));
      if (role !== "api") {
        await ensureGroups();
        await acquirePartitionLeases();
        running = true;
        leaseTimer = setInterval(() => {
          void renewPartitionLeases().catch((error) => {
            console.error("[hosted-orchestrator] partition lease renewal failed", error);
            running = false;
            process.exitCode = 1;
            setTimeout(() => process.exit(1), 0);
          });
        }, 3_000);
        void consume();
      }
    },

    async execute(
      type: string,
      payload: Record<string, unknown>,
      partitionKey: string,
      commandId: string = crypto.randomUUID(),
    ) {
      if (role === "worker") {
        throw new Error("Worker-only command backbone cannot publish commands.");
      }
      const partition = partitionForKey(partitionKey, partitionCount);
      await producer.xAdd(
        streamForPartition(partition),
        "*",
        { commandId, type, partitionKey, payload: JSON.stringify(payload) },
        { TRIM: { strategy: "MAXLEN", strategyModifier: "~", threshold: maxStreamLength } },
      );
      const reply = await waiter.brPop(responseKey(commandId), responseTimeoutSeconds);
      if (!reply) {
        return {
          statusCode: 504,
          body: { error: "orchestrator_command_timeout", commandId },
        } satisfies CommandResponse;
      }
      const response = JSON.parse(reply.element) as StoredResponse;
      return { statusCode: response.statusCode, body: response.body } satisfies CommandResponse;
    },

    async stop() {
      running = false;
      if (leaseTimer) {
        clearInterval(leaseTimer);
        leaseTimer = null;
      }
      const clients = role === "api" ? [producer, waiter] : role === "worker" ? [producer, consumer] : [producer, consumer, waiter];
      if (role !== "api" && producer.isOpen) {
        await releasePartitionLeases();
      }
      await Promise.all(clients.filter((client) => client.isOpen).map((client) => client.close()));
    },

    async readiness() {
      const leases = await producer.mGet(
        Array.from({ length: partitionCount }, (_, partition) => leaseKey(partition)),
      );
      const missingPartitions = leases
        .map((lease, partition) => (lease ? null : partition))
        .filter((partition): partition is number => partition !== null);
      return { ready: missingPartitions.length === 0, missingPartitions };
    },

    info: { streamKey, groupName, consumerName, role, partitionCount, assignedPartitions },
  };
}
