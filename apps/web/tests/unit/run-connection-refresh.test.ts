import assert from "node:assert/strict";
import test from "node:test";
import { shouldRefreshHostedConnection } from "../../lib/run-connection-refresh";

test("refreshes a metadata-gated connection after hosted allocation begins", () => {
  assert.equal(shouldRefreshHostedConnection(true, [{ type: "agent.connected" }]), true);
  assert.equal(shouldRefreshHostedConnection(true, [{ type: "hosted.session.created" }]), true);
  assert.equal(shouldRefreshHostedConnection(true, [{ type: "hosted.session.progress" }]), true);
});

test("does not reload an already resolved connection for unrelated events", () => {
  assert.equal(shouldRefreshHostedConnection(true, [{ type: "hosted.page.load" }]), false);
  assert.equal(shouldRefreshHostedConnection(false, [{ type: "agent.connected" }]), false);
});
