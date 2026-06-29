import type { ServerResponse } from "node:http";
import type { ForumThread } from "./types.js";
import type { HostedSessionFor } from "../../runtime/types.js";
import { shouldRenderScorePreview } from "../../runtime/score-preview-policy.js";

type ForumSession = HostedSessionFor<"forum-lite">;
import { escapeHtml, layout, sendHtml } from "../../templates.js";

export function renderForumIndex(
  session: ForumSession,
  response: ServerResponse,
  publicBaseUrl: string,
  defaultStartPathForApp: (app: string) => string,
) {
  const cards = session.state.threads
    .map(
      (thread) => `<article class="card">
        <h2>${escapeHtml(thread.title)}${thread.pinned ? ' <span class="accent">[Pinned]</span>' : ""}</h2>
        <p class="muted">Category: ${escapeHtml(thread.category)} · Posts: ${thread.posts.length}${thread.locked ? " · <span class=\"danger\">Locked</span>" : ""}${thread.pinned ? " · <span class=\"accent\">Pinned</span>" : ""}</p>
        <a href="/forum/thread/${encodeURIComponent(thread.id)}?session=${encodeURIComponent(session.token)}">Open thread</a>
      </article>`,
    )
    .join("");

  sendHtml(
    response,
    200,
    layout({
      title: "AgentBench Forum",
      session,
      body: `<section class="grid">${cards}</section>`,
      publicBaseUrl,
      defaultStartPathForApp,
    }),
  );
}

export function renderThread(
  session: ForumSession,
  thread: ForumThread,
  response: ServerResponse,
  publicBaseUrl: string,
  defaultStartPathForApp: (app: string) => string,
  score: { status: string; score: number; summary: string },
) {
  const postsHtml = thread.posts
    .map(
      (post) => `<div style="border-bottom:1px solid var(--line);padding:12px 0;">
        <p style="margin:0 0 4px;"><strong>${escapeHtml(post.author)}</strong></p>
        <p style="margin:0;">${escapeHtml(post.body)}</p>
      </div>`,
    )
    .join("");

  const lockedBanner = thread.locked
    ? `<div class="panel" style="background:#fff0ef;border-color:#e8b4b0;">
        <p class="danger" style="margin:0;">This thread is locked.</p>
      </div>`
    : "";

  const pinnedBanner = thread.pinned
    ? `<div class="panel" style="background:#f0fff4;border-color:#b0e8b4;">
        <p style="margin:0;color:#2f7d32;">This thread is pinned.</p>
      </div>`
    : "";

  const replyForm = thread.locked
    ? ""
    : `<section class="panel" style="margin-top:16px;">
        <h2>Reply</h2>
        <form method="post" action="/forum/thread/${encodeURIComponent(thread.id)}/reply?session=${encodeURIComponent(session.token)}">
          <label>
            Message
            <textarea name="body" rows="4" style="display:block;width:100%;margin-top:8px;border:1px solid #d8d2c7;border-radius:6px;padding:8px 10px;font-family:inherit;"></textarea>
          </label>
          <button type="submit" style="margin-top:12px;">Post reply</button>
        </form>
      </section>`;

  const lockForm = thread.locked
    ? ""
    : `<section class="panel" style="margin-top:16px;">
        <h2>Lock thread</h2>
        <form method="post" action="/forum/thread/${encodeURIComponent(thread.id)}/lock?session=${encodeURIComponent(session.token)}">
          <label>
            Lock reason
            <input name="reason" placeholder="Enter the required moderation reason" style="display:block;width:100%;min-height:40px;margin-top:8px;border:1px solid #d8d2c7;border-radius:6px;padding:8px 10px;" />
          </label>
          <button type="submit" style="margin-top:12px;">Lock thread</button>
        </form>
      </section>`;

  const reportForm = thread.locked
    ? ""
    : `<section class="panel" style="margin-top:16px;">
        <h2>Report thread</h2>
        <form method="post" action="/forum/thread/${encodeURIComponent(thread.id)}/report?session=${encodeURIComponent(session.token)}">
          <label>
            Report reason
            <input name="reason" placeholder="Enter the required report reason" style="display:block;width:100%;min-height:40px;margin-top:8px;border:1px solid #d8d2c7;border-radius:6px;padding:8px 10px;" />
          </label>
          <button type="submit" style="margin-top:12px;">Report thread</button>
        </form>
      </section>`;

  const pinForm = thread.locked && !thread.pinned
    ? `<section class="panel" style="margin-top:16px;">
        <h2>Pin thread</h2>
        <form method="post" action="/forum/thread/${encodeURIComponent(thread.id)}/pin?session=${encodeURIComponent(session.token)}">
          <label>
            Pin reason
            <input name="reason" placeholder="Enter the required pin reason" style="display:block;width:100%;min-height:40px;margin-top:8px;border:1px solid #d8d2c7;border-radius:6px;padding:8px 10px;" />
          </label>
          <button type="submit" style="margin-top:12px;">Pin thread</button>
        </form>
      </section>`
    : "";

  const moveForm = thread.locked
    ? ""
    : `<section class="panel" style="margin-top:16px;">
        <h2>Move thread</h2>
        <form method="post" action="/forum/thread/${encodeURIComponent(thread.id)}/move?session=${encodeURIComponent(session.token)}">
          <label>
            Target category
            <input name="category" placeholder="e.g. safety" style="display:block;width:100%;min-height:40px;margin-top:8px;border:1px solid #d8d2c7;border-radius:6px;padding:8px 10px;" />
          </label>
          <button type="submit" style="margin-top:12px;">Move thread</button>
        </form>
      </section>`;

  const editTitleForm = thread.locked
    ? ""
    : `<section class="panel" style="margin-top:16px;">
        <h2>Edit title</h2>
        <form method="post" action="/forum/thread/${encodeURIComponent(thread.id)}/edit-title?session=${encodeURIComponent(session.token)}">
          <label>
            New title
            <input name="title" placeholder="Enter a clear, specific title" style="display:block;width:100%;min-height:40px;margin-top:8px;border:1px solid #d8d2c7;border-radius:6px;padding:8px 10px;" />
          </label>
          <button type="submit" style="margin-top:12px;">Update title</button>
        </form>
      </section>`;

  const markDuplicateForm = thread.locked
    ? ""
    : `<section class="panel" style="margin-top:16px;">
        <h2>Mark as duplicate</h2>
        <form method="post" action="/forum/thread/${encodeURIComponent(thread.id)}/mark-duplicate?session=${encodeURIComponent(session.token)}">
          <label>
            Canonical thread id
            <input name="duplicateOfThreadId" placeholder="e.g. thr-charge-main" style="display:block;width:100%;min-height:40px;margin-top:8px;border:1px solid #d8d2c7;border-radius:6px;padding:8px 10px;" />
          </label>
          <button type="submit" style="margin-top:12px;">Mark duplicate</button>
        </form>
      </section>`;

  const moderationLog = session.state.moderationActions
    .filter((action) => action.threadId === thread.id)
    .map((action) => `<li><strong>${escapeHtml(action.action)}</strong>: ${escapeHtml(action.reason)}</li>`)
    .join("");
  const moderationLogSection = moderationLog
    ? `<section class="panel" style="margin-top:16px;">
        <h2>Moderation log</h2>
        <ul>${moderationLog}</ul>
      </section>`
    : "";


  const scorePreview = shouldRenderScorePreview(session)
    ? `<section class="panel" style="margin-top:16px;">
        <h2>Evaluator preview</h2>
        <pre class="score">${escapeHtml(JSON.stringify(score, null, 2))}</pre>
      </section>`
    : "";

  sendHtml(
    response,
    200,
    layout({
      title: thread.title,
      session,
      body: `
        ${lockedBanner}
        ${pinnedBanner}
        <section class="panel">
          <h2>${escapeHtml(thread.title)}</h2>
          <p class="muted">Category: ${escapeHtml(thread.category)}</p>
          <div>${postsHtml}</div>
        </section>
        ${replyForm}
        ${reportForm}
        ${moveForm}
        ${editTitleForm}
        ${markDuplicateForm}
        ${lockForm}
        ${pinForm}
        ${moderationLogSection}
        ${scorePreview}`,
      publicBaseUrl,
      defaultStartPathForApp,
    }),
  );
}
