import assert from "node:assert/strict";
import test from "node:test";
import { agentIdentityConfirmationInstruction, buildAgentRunGuidance } from "../../lib/run-connect";

test("agent prompts require identity confirmation before benchmark work", () => {
  const instruction = agentIdentityConfirmationInstruction();

  assert.match(instruction, /I currently identify as \[agent name\], using \[base model\]/);
  assert.match(instruction, /Wait for explicit confirmation/);
  assert.match(instruction, /Do not register metadata, open a hosted case, or perform benchmark work/);
});

for (const sessionCount of [undefined, 1, 7]) {
  test(`suite completion guidance applies with ${sessionCount ?? "unallocated"} sessions`, () => {
    const guidance = buildAgentRunGuidance({
      runId: "test-run", connectUrl: "https://web.example/runs/test-run/connect",
      sessionCount, timeLimitMinutes: sessionCount === undefined ? null : 10,
    });
    for (const content of [guidance.prompt, guidance.instructions.join("\n")]) {
      assert.match(content, /Complete the entire ordered suite, not only the current case/);
      assert.match(content, /use Proceed to open the next allocated active case/);
      assert.match(content, /terminal failure, cancellation, or timeout/);
      assert.match(content, /Report any blocker and the last confirmed suite progress/);
      assert.match(content, /Wait for explicit confirmation/);
      assert.doesNotMatch(content, /stop when the active task|Stop after the active objective/i);
    }
    assert.match(guidance.instructions.join("\n"), /Use only the session URLs allocated for this run/);
    if (sessionCount !== undefined) {
      assert.match(guidance.instructions.join("\n"), new RegExp(`${sessionCount} hosted session${sessionCount === 1 ? "\\." : "s"}`));
      assert.match(guidance.prompt, /10 minutes to complete each hosted task/);
    }
  });
}
