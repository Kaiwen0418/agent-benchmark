import type { ServerResponse } from "node:http";
import type { HostedAttemptReadModel } from "@agentbench/shared";
import type { HostedSession, HostedAttemptOverviewSession } from "./runtime/types.js";
import { sendJson } from "./runtime/http.js";

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function money(value: number) {
  return `$${value.toFixed(2)}`;
}

export function sendHtml(response: ServerResponse, status: number, body: string) {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(body);
}

export function layout(params: {
  title: string;
  session: HostedSession;
  body: string;
  publicBaseUrl: string;
  defaultStartPathForApp: (app: string) => string;
}) {
  const telemetry = `
    <script>
      window.AgentBenchHostedSession = ${JSON.stringify({
        token: params.session.token,
        taskSlug: params.session.taskSlug,
      })};
      function abTelemetry(type, payload) {
        fetch("/api/telemetry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session: window.AgentBenchHostedSession.token,
            type: type,
            payload: payload || {},
            url: window.location.href,
            title: document.title
          })
        }).catch(function () {});
      }
      window.addEventListener("load", function () {
        abTelemetry("page.load", {});
      });
      document.addEventListener("click", function (event) {
        var target = event.target && event.target.closest ? event.target.closest("button,a,input,select,textarea") : null;
        if (!target) return;
        abTelemetry("click", {
          tag: target.tagName,
          text: (target.innerText || target.value || target.getAttribute("aria-label") || "").slice(0, 80),
          name: target.getAttribute("name"),
          href: target.getAttribute("href")
        });
      }, true);
      document.addEventListener("input", function (event) {
        var target = event.target;
        if (!target || !target.getAttribute) return;
        abTelemetry("input", {
          tag: target.tagName,
          name: target.getAttribute("name"),
          valuePreview: String(target.value || "").slice(0, 40)
        });
      }, true);
    </script>
  `;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(params.title)}</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #171717;
        --muted: #69645c;
        --line: #d8d2c7;
        --surface: #f7f3ea;
        --panel: #ffffff;
        --accent: #0f766e;
        --danger: #a33b2f;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--ink);
        background: linear-gradient(180deg, #f7f3ea 0%, #ece6d9 100%);
      }
      header, main { max-width: 1040px; margin: 0 auto; padding: 24px; }
      header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
      h1 { margin: 0; font-size: 30px; line-height: 1.1; }
      h2 { margin: 0 0 12px; font-size: 20px; }
      p { color: var(--muted); line-height: 1.55; }
      a { color: var(--accent); font-weight: 700; text-decoration: none; }
      .task {
        margin-top: 12px;
        padding: 14px 16px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.72);
      }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; }
      .card, .panel {
        border: 1px solid var(--line);
        background: var(--panel);
        border-radius: 8px;
        padding: 16px;
      }
      .price { font-size: 22px; font-weight: 800; }
      .muted { color: var(--muted); }
      .danger { color: var(--danger); font-weight: 700; }
      button, select {
        min-height: 38px;
        border: 1px solid #0b5f59;
        background: var(--accent);
        color: white;
        border-radius: 6px;
        padding: 8px 12px;
        font-weight: 800;
        cursor: pointer;
      }
      select {
        color: var(--ink);
        background: white;
        border-color: var(--line);
      }
      table { width: 100%; border-collapse: collapse; background: white; }
      th, td { border-bottom: 1px solid var(--line); padding: 10px; text-align: left; }
      .nav { display: flex; gap: 12px; flex-wrap: wrap; }
      .score { white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
    </style>
    ${telemetry}
  </head>
  <body>
    <header>
      <div>
        <h1>${escapeHtml(params.title)}</h1>
        <div class="task">${escapeHtml(params.session.goal)}</div>
      </div>
      <nav class="nav">
        ${
          params.session.app === "wiki-lite"
            ? `
        <a href="/wiki?session=${encodeURIComponent(params.session.token)}">Search</a>
        <a href="/wiki/article/agentbench-release-history?session=${encodeURIComponent(params.session.token)}">Release History</a>
        `
            : `
        <a href="/shopping?session=${encodeURIComponent(params.session.token)}">Products</a>
        <a href="/shopping/cart?session=${encodeURIComponent(params.session.token)}">Cart</a>
        `
        }
        <a href="/api/sessions/${encodeURIComponent(params.session.token)}/score">Score JSON</a>
      </nav>
    </header>
    <main>${params.body}</main>
  </body>
</html>`;
}

export function renderAttemptOverview(
  readModel: HostedAttemptReadModel<HostedAttemptOverviewSession>,
  currentSession: HostedSession,
  response: ServerResponse,
  publicBaseUrl: string,
  defaultStartPathForApp: (app: string) => string,
) {
  const cards = readModel.sessions
    .map((session, index) => {
      const state = session.id === readModel.activeSessionId ? "active" : session.status;
      return `<article class="card">
        <div class="muted">Session ${index + 1}</div>
        <h2>${escapeHtml(session.title ?? session.taskSlug)}</h2>
        <p>${escapeHtml(session.goal)}</p>
        <p class="muted">App: ${escapeHtml(session.app)} · State: ${escapeHtml(state)}</p>
        <a href="${escapeHtml(`${publicBaseUrl}${session.startPath ?? defaultStartPathForApp(session.app)}?session=${encodeURIComponent(session.token)}`)}">Open session</a>
      </article>`;
    })
    .join("");

  sendHtml(
    response,
    200,
    layout({
      title: "Hosted Suite Overview",
      session: currentSession,
      body: `<section class="panel">
        <h2>Attempt ${escapeHtml(readModel.attemptId)}</h2>
        <p>${readModel.progress.completed} of ${readModel.progress.total} sessions have submitted results.</p>
      </section>
      <section class="grid" style="margin-top:16px;">${cards}</section>`,
      publicBaseUrl,
      defaultStartPathForApp,
    }),
  );
}
