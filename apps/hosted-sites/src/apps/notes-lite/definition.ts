import { isStateRecord, readStateArray, type HostedAppDefinition } from "../../runtime/app-definition.js";
import { evaluateNotes } from "./evaluate.js";
import { buildNotesFinalState } from "./final-state.js";
import { createNotesRoutes } from "./routes.js";
import { getNotesDefaultGoal, getNotesStartPath } from "./seed.js";
import type { Note } from "./types.js";

function isNote(value: unknown): value is Note {
  return (
    isStateRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.body === "string" &&
    typeof value.tag === "string" &&
    typeof value.createdAt === "string"
  );
}

export const notesLiteDefinition: HostedAppDefinition<"notes-lite"> = {
  id: "notes-lite",
  stateKeys: ["notes"],
  getDefaultStartPath: getNotesStartPath,
  getDefaultGoal: () => getNotesDefaultGoal(),
  buildInitialSessionState: () => ({
    notes: [],
  }),
  hydratePersistedState: (value) => ({
    notes: readStateArray(value, "notes", isNote),
  }),
  buildFinalState: buildNotesFinalState,
  evaluate: evaluateNotes,
  createRoutes: (deps) => [createNotesRoutes(deps).handle],
};
