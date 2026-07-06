import test from "node:test";
import assert from "node:assert/strict";
import { forumCompletionAction } from "../../../src/apps/forum-lite/routes.js";

function metadata(requiresPin?: boolean) {
  return {
    questionGeneration: {
      taskConfig: {
        ...(requiresPin === undefined ? {} : { requiresPin }),
      },
    },
  };
}

test("forum lock is terminal when pinning is not required", () => {
  assert.equal(forumCompletionAction(metadata()), "lock");
  assert.equal(forumCompletionAction(metadata(false)), "lock");
});

test("forum pin is terminal when pinning is required", () => {
  assert.equal(forumCompletionAction(metadata(true)), "pin");
});
