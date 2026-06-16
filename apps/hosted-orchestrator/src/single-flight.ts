export function createSingleFlight<TParams, TResult>(params: {
  key: (input: TParams) => string;
  run: (input: TParams) => Promise<TResult>;
}) {
  const inFlight = new Map<string, Promise<TResult>>();

  return (input: TParams) => {
    const key = params.key(input);
    const existing = inFlight.get(key);
    if (existing) {
      return existing;
    }

    const pending = params.run(input).finally(() => {
      if (inFlight.get(key) === pending) {
        inFlight.delete(key);
      }
    });
    inFlight.set(key, pending);
    return pending;
  };
}
