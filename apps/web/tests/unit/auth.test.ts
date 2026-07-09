import assert from "node:assert/strict";
import test from "node:test";
import { getCurrentUser } from "../../lib/auth";

test("current authentication seam remains guest-only until Auth.js is integrated", async () => {
  assert.equal(await getCurrentUser(), null);
});
