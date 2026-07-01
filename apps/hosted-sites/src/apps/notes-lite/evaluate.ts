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
  const expectedNotes = readExpectedNotes(config);
  const backend =
    expectedNotes.length > 0
      ? evaluateExpectedNoteSet(session.state.notes, expectedNotes)
      : evaluateNotesBackendState(session.state.notes, expectedTitle, expectedBody, expectedTag, targetNoteId);

  return aggregateStrictScore({
    evaluators: [backend],
    passSummary: expectedNotes.length > 0
      ? "Agent created the complete generated note set with exact titles, bodies, and tags."
      : targetNoteId
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

type ExpectedNote = Pick<Note, "title" | "body" | "tag">;

function readExpectedNotes(config: Record<string, unknown>): ExpectedNote[] {
  if (!Array.isArray(config.expectedNotes)) return [];
  return config.expectedNotes.filter(
    (value): value is ExpectedNote =>
      typeof value === "object" &&
      value !== null &&
      typeof (value as ExpectedNote).title === "string" &&
      typeof (value as ExpectedNote).body === "string" &&
      typeof (value as ExpectedNote).tag === "string",
  );
}

function evaluateExpectedNoteSet(notes: Note[], expectedNotes: ExpectedNote[]): HostedWebEvaluatorResult {
  const matched = expectedNotes.map((expected) =>
    notes.some(
      (note) =>
        note.title.trim() === expected.title &&
        note.body.trim() === expected.body &&
        note.tag.trim() === expected.tag,
    ),
  );
  const passed = matched.every(Boolean);
  const evidence = { requiredNoteCount: expectedNotes.length, matchedNoteCount: matched.filter(Boolean).length };
  return passed
    ? passedEvaluator({ type: "backend_state", name: "generated note set exists", evidence })
    : failedEvaluator({
        type: "backend_state",
        name: "generated note set exists",
        errorMessage: "One or more required notes are missing or do not exactly match.",
        evidence,
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
