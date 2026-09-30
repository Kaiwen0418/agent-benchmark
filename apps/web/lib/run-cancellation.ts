import type { BenchmarkRun } from "@agentbench/protocol";

export type RunOwnerIdentity = { userId: string } | { guestId: string };

export function isRunOwnedBy(run: BenchmarkRun, owner: RunOwnerIdentity) {
  return "userId" in owner
    ? run.userId === owner.userId
    : run.userId === null && run.guestId === owner.guestId;
}
