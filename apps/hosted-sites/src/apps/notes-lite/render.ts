import type { ServerResponse } from "node:http";
import type { HostedSessionFor } from "../../runtime/types.js";
import { escapeHtml, layout, sendHtml } from "../../templates.js";

type NotesSession = HostedSessionFor<"notes-lite">;

export function renderNotesIndex(
  session: NotesSession,
  response: ServerResponse,
  publicBaseUrl: string,
  defaultStartPathForApp: (app: string) => string,
  score: { status: string; score: number; summary: string },
) {
  const notesHtml = session.state.notes.length
    ? session.state.notes
        .map(
          (note) => `<article class="card">
            <p class="muted" style="margin-top:0;">${escapeHtml(note.tag)} · ${escapeHtml(note.createdAt)}</p>
            <h2>${escapeHtml(note.title)}</h2>
            <p>${escapeHtml(note.body)}</p>
          </article>`,
        )
        .join("")
    : `<article class="card"><p class="muted">No notes have been created yet.</p></article>`;

  sendHtml(
    response,
    200,
    layout({
      title: "AgentBench Notes",
      session,
      body: `
        <section class="panel">
          <h2>Create note</h2>
          <form method="post" action="/notes/create?session=${encodeURIComponent(session.token)}">
            <label>
              Title
              <input name="title" style="display:block;width:100%;min-height:40px;margin-top:8px;border:1px solid #d8d2c7;border-radius:6px;padding:8px 10px;" />
            </label>
            <label style="display:block;margin-top:12px;">
              Body
              <textarea name="body" rows="5" style="display:block;width:100%;margin-top:8px;border:1px solid #d8d2c7;border-radius:6px;padding:8px 10px;font-family:inherit;"></textarea>
            </label>
            <label style="display:block;margin-top:12px;">
              Tag
              <input name="tag" style="display:block;width:100%;min-height:40px;margin-top:8px;border:1px solid #d8d2c7;border-radius:6px;padding:8px 10px;" />
            </label>
            <button type="submit" style="margin-top:12px;">Save note</button>
          </form>
        </section>
        <section class="grid" style="margin-top:16px;">${notesHtml}</section>
        <section class="panel" style="margin-top:16px;">
          <h2>Evaluator preview</h2>
          <pre class="score">${escapeHtml(JSON.stringify(score, null, 2))}</pre>
        </section>`,
      publicBaseUrl,
      defaultStartPathForApp,
    }),
  );
}
