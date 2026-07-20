import type { ServerResponse } from "node:http";
import type { HostedSessionFor } from "../../runtime/types.js";
import { readTaskConfig } from "../../runtime/question-config.js";
import { escapeHtml, layout, sendHtml } from "../../templates.js";
import { readInboxPolicyAmendment } from "./policy-amendment.js";
import type { InboxThread } from "./types.js";

type InboxSession = HostedSessionFor<"inbox-lite">;

function shell(
  session: InboxSession,
  body: string,
  response: ServerResponse,
  publicBaseUrl: string,
  defaultStartPathForApp: (app: string) => string,
  title = "InboxLite",
) {
  let policyAmendment: ReturnType<typeof readInboxPolicyAmendment> = null;
  try {
    policyAmendment = readInboxPolicyAmendment(readTaskConfig(session.metadata));
  } catch {
    policyAmendment = null;
  }
  const latestPolicyCheck = session.state.inboxPolicyChecks.at(-1);
  const policyHtml = policyAmendment
    ? `<section class="panel" style="margin-top:16px;">
      <h2>Policy amendment</h2>
      <p class="muted">${escapeHtml(
        latestPolicyCheck?.status === "updated"
          ? policyAmendment.appliedMessage
          : latestPolicyCheck?.status === "pending"
            ? policyAmendment.pendingMessage
            : "A routing amendment is pending. Recheck before sending.",
      )}</p>
      <p class="muted">Rechecks completed: ${session.state.inboxPolicyChecks.length}</p>
      <form method="post" action="/inbox/policy/recheck?session=${encodeURIComponent(session.token)}">
        <button type="submit">Recheck policy</button>
      </form>
    </section>`
    : "";
  sendHtml(response, 200, layout({
    title,
    session,
    publicBaseUrl,
    defaultStartPathForApp,
    body: `<nav class="panel" style="display:flex;gap:16px;align-items:center;">
      <a href="/inbox?session=${encodeURIComponent(session.token)}">Inbox</a>
      <a href="/inbox/compose?session=${encodeURIComponent(session.token)}">Compose</a>
      <span class="muted">${escapeHtml(String(session.state.inboxDrafts.length))} drafts</span>
    </nav>${policyHtml}${body}`,
  }));
}

export function renderInboxIndex(
  session: InboxSession,
  response: ServerResponse,
  publicBaseUrl: string,
  defaultStartPathForApp: (app: string) => string,
) {
  const threads = session.state.inboxThreads.map((thread) => `
    <article class="card">
      <p class="muted" style="margin-top:0;">${escapeHtml(thread.participants.join(", "))}</p>
      <h2>${escapeHtml(thread.subject)}</h2>
      <p>${escapeHtml(thread.messages.at(-1)?.body ?? "")}</p>
      <a href="/inbox/thread/${encodeURIComponent(thread.id)}?session=${encodeURIComponent(session.token)}">Open thread</a>
    </article>`).join("");
  shell(
    session,
    `<section class="panel" style="margin-top:16px;"><h1>Inbox</h1><p class="muted">Review messages and attachments before routing a response.</p></section>
     <section class="grid" style="margin-top:16px;">${threads}</section>`,
    response,
    publicBaseUrl,
    defaultStartPathForApp,
  );
}

export function renderInboxThread(
  session: InboxSession,
  thread: InboxThread,
  response: ServerResponse,
  publicBaseUrl: string,
  defaultStartPathForApp: (app: string) => string,
) {
  const messages = thread.messages.map((message) => `<article class="card">
    <p class="muted" style="margin-top:0;">From ${escapeHtml(message.author)} · ${escapeHtml(message.createdAt)}</p>
    <p>${escapeHtml(message.body)}</p>
  </article>`).join("");
  const attachments = thread.attachments.length > 0
    ? thread.attachments.map((attachment) => `<article class="card">
        <h3>${escapeHtml(attachment.name)}</h3><pre style="white-space:pre-wrap;">${escapeHtml(attachment.body)}</pre>
      </article>`).join("")
    : `<p class="muted">No attachments.</p>`;
  shell(
    session,
    `<section class="panel" style="margin-top:16px;">
       <p class="muted">${escapeHtml(thread.participants.join(", "))}</p>
       <h1>${escapeHtml(thread.subject)}</h1>
       <a href="/inbox/compose?thread=${encodeURIComponent(thread.id)}&session=${encodeURIComponent(session.token)}">Compose approval</a>
     </section>
     <section class="grid" style="margin-top:16px;">${messages}</section>
     <section class="panel" style="margin-top:16px;"><h2>Attachments</h2>${attachments}</section>`,
    response,
    publicBaseUrl,
    defaultStartPathForApp,
    thread.subject,
  );
}

export function renderInboxCompose(
  session: InboxSession,
  selectedThreadId: string | null,
  response: ServerResponse,
  publicBaseUrl: string,
  defaultStartPathForApp: (app: string) => string,
) {
  const options = session.state.inboxThreads.map((thread) => `<option value="${escapeHtml(thread.id)}"${thread.id === selectedThreadId ? " selected" : ""}>${escapeHtml(thread.subject)}</option>`).join("");
  const drafts = session.state.inboxDrafts.map((draft) => `<article class="card">
    <h3>Saved draft</h3>
    <p class="muted">Revision count: ${draft.revisionCount}</p>
    <form method="post" action="/inbox/drafts/${encodeURIComponent(draft.id)}?session=${encodeURIComponent(session.token)}">
      <label style="display:block;margin-top:12px;">Recipients (comma separated)<input name="recipients" value="${escapeHtml(draft.recipients.join(", "))}" style="display:block;width:100%;margin-top:8px;" /></label>
      <label style="display:block;margin-top:12px;">Subject<input name="subject" value="${escapeHtml(draft.subject)}" style="display:block;width:100%;margin-top:8px;" /></label>
      <label style="display:block;margin-top:12px;">Body<textarea name="body" rows="6" style="display:block;width:100%;margin-top:8px;">${escapeHtml(draft.body)}</textarea></label>
      <button type="submit" style="margin-top:12px;">Update saved draft</button>
    </form>
    <form method="post" action="/inbox/drafts/${encodeURIComponent(draft.id)}/send?session=${encodeURIComponent(session.token)}" style="margin-top:8px;">
      <button type="submit">Send saved draft</button>
    </form>
  </article>`).join("");
  shell(
    session,
    `<section class="panel" style="margin-top:16px;">
      <h1>Compose approval request</h1>
      <form method="post" action="/inbox/send?session=${encodeURIComponent(session.token)}">
        <label>Related thread<select name="threadId" style="display:block;width:100%;margin-top:8px;">${options}</select></label>
        <label style="display:block;margin-top:12px;">Recipients (comma separated)<input name="recipients" style="display:block;width:100%;margin-top:8px;" /></label>
        <label style="display:block;margin-top:12px;">Subject<input name="subject" style="display:block;width:100%;margin-top:8px;" /></label>
        <label style="display:block;margin-top:12px;">Body<textarea name="body" rows="6" style="display:block;width:100%;margin-top:8px;"></textarea></label>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button type="submit">Send request</button>
          <button type="submit" formaction="/inbox/drafts?session=${encodeURIComponent(session.token)}">Save draft</button>
        </div>
      </form>
    </section>
    ${drafts ? `<section class="grid" style="margin-top:16px;">${drafts}</section>` : ""}`,
    response,
    publicBaseUrl,
    defaultStartPathForApp,
    "Compose approval request",
  );
}
