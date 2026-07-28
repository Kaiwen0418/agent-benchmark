import assert from "node:assert/strict";
import test from "node:test";
import { agentIdentityConfirmationInstruction } from "../../lib/run-connect";

test("agent prompts require identity confirmation before benchmark work", () => {
  const instruction = agentIdentityConfirmationInstruction();

  assert.match(instruction, /I currently identify as \[agent name\], using \[base model\]/);
  assert.match(instruction, /Wait for explicit confirmation/);
  assert.match(instruction, /Do not register metadata, open a hosted case, or perform benchmark work/);
});
