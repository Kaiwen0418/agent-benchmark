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
  const expectedTitle = configString(config, "expectedTitle");
  const expectedBody = configString(config, "expectedBody");
  const expectedTag = configString(config, "expectedTag");
  const targetNoteId = configStringOrNull(config, "targetNoteId");
  const backend = evaluateNotesBackendState(session.state.notes, expectedTitle, expectedBody, expectedTag, targetNoteId);

  return aggregateStrictScore({
    evaluators: [backend],
    passSummary: targetNoteId
      ? "Agent updated the requested seeded note to the exact generated title, body, and tag."
      : "Agent created the requested note with the exact generated title, body, and tag.",
    failSummary: "The requested note was not found in backend state.",
  });
}

function evaluateNotesBackendState(
  notes: Note[],
  expectedTitle: string,
  expectedBody: string,
  expectedTag: string,
  targetNoteId: string | null,
): HostedWebEvaluatorResult {
  const candidateNotes = targetNoteId ? notes.filter((note) => note.id === targetNoteId) : notes;
  const matchingNote = candidateNotes.find(
    (note) => note.title.trim() === expectedTitle && note.body.trim() === expectedBody && note.tag.trim() === expectedTag,
  );
  const evidence = {
    expectedTitle,
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
          : "No note exactly matches the generated title, body, and tag.",
        evidence,
      });
}
