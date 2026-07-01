import {
  aggregateStrictScore,
  failedEvaluator,
  passedEvaluator,
  type HostedWebEvaluatorResult,
  type HostedWebScoreResult,
} from "@agentbench/scoring";
import { configString, configStringOrNull, readTaskConfig } from "../../runtime/question-config.js";
import type { Note } from "./types.js";

export type NotesEvaluationSession = {
  app: "notes-lite" | string;
  taskSlug: string;
  metadata: Record<string, unknown>;
  state: {
    notes: Note[];
  };
};

export function evaluateNotes(session: NotesEvaluationSession): HostedWebScoreResult {
  const config = readTaskConfig(session.metadata);
  const expectedTitle = configStringOrNull(config, "expectedTitle");
  const expectedBody = configString(config, "expectedBody");
  const expectedTag = configString(config, "expectedTag");
  const targetNoteId = configStringOrNull(config, "targetNoteId");
  const backend = evaluateNotesBackendState(session.state.notes, expectedTitle, expectedBody, expectedTag, targetNoteId);

  return aggregateStrictScore({
    evaluators: [backend],
    passSummary: targetNoteId
      ? "Agent updated the requested seeded note to the exact generated title, body, and tag."
      : expectedTitle
        ? "Agent created the requested note with the exact generated title, body, and tag."
        : "Agent created the requested note with the correct body and tag and a non-empty carried title.",
    failSummary: "The requested note was not found in backend state.",
  });
}

function evaluateNotesBackendState(
  notes: Note[],
  expectedTitle: string | null,
  expectedBody: string,
  expectedTag: string,
  targetNoteId: string | null,
): HostedWebEvaluatorResult {
  const candidateNotes = targetNoteId ? notes.filter((note) => note.id === targetNoteId) : notes;
  // When the title is pinned, require an exact match; for cross-app carry
  // variants (#115) the title is unpinned, so accept any non-empty title here
  // and let the suite-level consistency check verify the carried value.
  const titleMatches = (note: Note) =>
    expectedTitle === null ? note.title.trim().length > 0 : note.title.trim() === expectedTitle;
  const matchingNote = candidateNotes.find(
    (note) => titleMatches(note) && note.body.trim() === expectedBody && note.tag.trim() === expectedTag,
  );
  const evidence = {
    expectedTitle,
    titlePinned: expectedTitle !== null,
    expectedTag,
    targetNoteId,
    noteCount: notes.length,
    matchingNoteId: matchingNote?.id ?? null,
  };

  return matchingNote
    ? passedEvaluator({
        type: "backend_state",
        name: "generated note exists",
        evidence,
      })
    : failedEvaluator({
        type: "backend_state",
        name: "generated note exists",
        errorMessage: targetNoteId
          ? "The targeted seeded note was not updated to the expected title, body, and tag."
          : expectedTitle === null
            ? "No note has the expected body and tag with a non-empty title."
            : "No note exactly matches the generated title, body, and tag.",
        evidence,
      });
}
