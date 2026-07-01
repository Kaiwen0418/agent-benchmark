import type { Note } from "./types.js";

export const notesSeedNotes: Note[] = [
  {
    id: "note-seed-support",
    title: "Old support follow-up",
    body: "Follow up with Mira about the replacement adapter.",
    tag: "support",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "note-seed-release",
    title: "Old release reminder",
    body: "Check the hosted-web v3.0.1 smoke run status.",
    tag: "release",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "note-seed-ops",
    title: "Old ops check",
    body: "Check Redis health metrics.",
    tag: "ops",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
];

export function getNotesStartPath() {
  return "/notes";
}

export function getNotesDefaultGoal() {
  return "Create the requested follow-up note with the exact title, body, and tag from the task instructions.";
}
