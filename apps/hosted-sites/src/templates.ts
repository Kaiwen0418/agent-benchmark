import type { ServerResponse } from "node:http";
import type { HostedAttemptReadModel } from "@agentbench/shared";
import type { HostedSession, HostedAttemptOverviewSession } from "./runtime/types.js";
import { sendJson } from "./runtime/http.js";
import { readUiVariant } from "./runtime/question-config.js";

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
  const uiVariant = readUiVariant(params.session.metadata);
  const appNav =
    params.session.app === "wiki-lite"
      ? `<a href="/wiki?session=${encodeURIComponent(params.session.token)}">Knowledge base</a>`
      : params.session.app === "forum-lite"
        ? `<a href="/forum?session=${encodeURIComponent(params.session.token)}">All threads</a>`
        : params.session.app === "repo-lite"
          ? `<a href="/repo?session=${encodeURIComponent(params.session.token)}">Repository</a>`
          : `<a href="/shopping?session=${encodeURIComponent(params.session.token)}">Catalog</a>
             <a href="/shopping/cart?session=${encodeURIComponent(params.session.token)}">Cart</a>`;
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
        --accent-soft: #d9eee9;
        --danger: #a33b2f;
        --radius: 8px;
        --shadow: none;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--ink);
        background: linear-gradient(180deg, #f7f3ea 0%, #ece6d9 100%);
      }
      .shell { max-width: 1120px; margin: 0 auto; }
      header, main { padding: 24px; }
      header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
      .heading { min-width: 0; flex: 1; }
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
        border-radius: var(--radius);
        padding: 16px;
        box-shadow: var(--shadow);
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
      .nav a { white-space: nowrap; }
      .score { white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
      .layout-badge { display: inline-block; margin-bottom: 8px; color: var(--muted); font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }

      body.ui-sidebar {
        --accent: #b45309;
        --accent-soft: #ffedd5;
        --surface: #f3eee5;
        --radius: 2px;
        background: linear-gradient(135deg, #f3eee5 0%, #e6dccb 100%);
      }
      .ui-sidebar .shell { display: grid; grid-template-columns: minmax(250px, 320px) minmax(0, 1fr); min-height: 100vh; }
      .ui-sidebar header { position: sticky; top: 0; height: 100vh; flex-direction: column; justify-content: flex-start; border-right: 1px solid var(--line); background: rgba(255,255,255,.68); backdrop-filter: blur(12px); }
      .ui-sidebar main { padding: 32px; }
      .ui-sidebar .nav { flex-direction: column; width: 100%; margin-top: auto; }
      .ui-sidebar .nav a { padding: 10px 12px; border: 1px solid var(--line); background: rgba(255,255,255,.72); }
      .ui-sidebar .task { background: var(--accent-soft); border-left: 4px solid var(--accent); }

      body.ui-compact {
        --ink: #18201d;
        --muted: #53615b;
        --line: #aab9b1;
        --surface: #e7eee9;
        --panel: #f8fbf9;
        --accent: #285943;
        --accent-soft: #dcebe2;
        --radius: 0;
        --shadow: 3px 3px 0 rgba(24,32,29,.13);
        background: repeating-linear-gradient(0deg, #e7eee9 0, #e7eee9 27px, #dce6df 28px);
      }
      .ui-compact .shell { max-width: 920px; }
      .ui-compact header { align-items: center; padding-bottom: 12px; border-bottom: 3px solid var(--ink); }
      .ui-compact h1 { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 24px; text-transform: uppercase; }
      .ui-compact .task { padding: 9px 11px; background: var(--accent-soft); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
      .ui-compact main { padding-top: 16px; }
      .ui-compact .grid { gap: 10px; }
      .ui-compact .card, .ui-compact .panel { padding: 12px; }
      .ui-compact .nav { justify-content: flex-end; font-size: 13px; }
      .ui-compact button { border-radius: 0; text-transform: uppercase; letter-spacing: .04em; }

      @media (max-width: 720px) {
        header, main { padding: 16px; }
        header { flex-direction: column; }
        .ui-sidebar .shell { display: block; }
        .ui-sidebar header { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); }
        .ui-sidebar main { padding: 16px; }
        .ui-sidebar .nav { flex-direction: row; margin-top: 4px; }
        .ui-compact header { align-items: flex-start; }
        .nav { width: 100%; }
      }
    </style>
    ${telemetry}
  </head>
  <body class="ui-${uiVariant}" data-ui-variant="${uiVariant}">
    <div class="shell">
    <header>
      <div class="heading">
        <span class="layout-badge">${escapeHtml(params.session.app)} · ${uiVariant}</span>
        <h1>${escapeHtml(params.title)}</h1>
        <div class="task">${escapeHtml(params.session.goal)}</div>
      </div>
      <nav class="nav">
        ${appNav}
        <a href="/api/sessions/${encodeURIComponent(params.session.token)}/score">Score JSON</a>
      </nav>
    </header>
    <main>${params.body}</main>
    </div>
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
