export type InitializationLease = {
  release: () => Promise<void>;
};

type InitializationLock = InitializationLease | "contended" | null;

export function createIdempotentInitializer<TInput, TResult>(deps: {
  key: (input: TInput) => string;
  findExisting: (input: TInput) => Promise<TResult | null>;
  waitForExisting: (input: TInput) => Promise<TResult>;
  acquireLock: (key: string) => Promise<InitializationLock>;
  create: (input: TInput) => Promise<TResult>;
}) {
  return async (input: TInput) => {
    const existing = await deps.findExisting(input);
    if (existing) {
      return existing;
    }

    const lease = await deps.acquireLock(deps.key(input));
    if (lease === "contended") {
      return deps.waitForExisting(input);
    }

    if (!lease) {
      return deps.create(input);
    }

    try {
      return (await deps.findExisting(input)) ?? await deps.create(input);
    } finally {
      await lease.release();
    }
  };
}
