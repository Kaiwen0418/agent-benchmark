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
  const expectedBody = configStringOrNull(config, "expectedBody");
  const expectedTag = configString(config, "expectedTag");
  const targetNoteId = configStringOrNull(config, "targetNoteId");
  const backend = evaluateNotesBackendState(session.state.notes, expectedTitle, expectedBody, expectedTag, targetNoteId);

  return aggregateStrictScore({
    evaluators: [backend],
    passSummary: targetNoteId
      ? expectedTitle && expectedBody
        ? "Agent updated the requested seeded note to the exact generated title, body, and tag."
        : "Agent updated the requested seeded note with the expected tag and non-empty carried fields."
      : expectedTitle
        ? "Agent created the requested note with the exact generated title, body, and tag."
        : expectedBody
          ? "Agent created the requested note with the correct body and tag and a non-empty carried title."
          : "Agent created a tagged note with non-empty carried title and body values.",
    failSummary: "The requested note was not found in backend state.",
  });
}

function evaluateNotesBackendState(
  notes: Note[],
  expectedTitle: string | null,
  expectedBody: string | null,
  expectedTag: string,
  targetNoteId: string | null,
): HostedWebEvaluatorResult {
  const candidateNotes = targetNoteId ? notes.filter((note) => note.id === targetNoteId) : notes;
  // Unpinned carry fields must be non-empty here; suite-level consistency
  // checks verify their values against the earlier sessions.
  const titleMatches = (note: Note) =>
    expectedTitle === null ? note.title.trim().length > 0 : note.title.trim() === expectedTitle;
  const matchingNote = candidateNotes.find(
    (note) =>
      titleMatches(note) &&
      (expectedBody === null ? note.body.trim().length > 0 : note.body.trim() === expectedBody) &&
      note.tag.trim() === expectedTag,
  );
  const evidence = {
    expectedTitle,
    titlePinned: expectedTitle !== null,
    bodyPinned: expectedBody !== null,
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
          ? expectedTitle && expectedBody
            ? "The targeted seeded note was not updated to the expected title, body, and tag."
            : "The targeted seeded note does not have the expected tag and non-empty carried fields."
          : expectedTitle === null || expectedBody === null
            ? "No note has the expected tag and non-empty carried fields."
            : "No note exactly matches the generated title, body, and tag.",
        evidence,
      });
}
