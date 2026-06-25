import type { ServerResponse } from "node:http";
import type { HostedSession } from "./runtime/types.js";
import { readUiTheme, readUiVariant } from "./runtime/question-config.js";

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
  const uiTheme = readUiTheme(params.session.metadata);
  const isViewer = params.session.accessMode === "viewer";
  const isTerminal = params.session.status === "completed" || params.session.status === "failed" || params.session.status === "expired";
  const connectionUrl = params.session.runId
    ? `${(process.env.AGENTBENCH_WEB_URL ?? "http://localhost:3000").replace(/\/$/, "")}/runs/${encodeURIComponent(params.session.runId)}/connect`
    : null;
  const taskHomePath = params.session.startPath ?? params.defaultStartPathForApp(params.session.app);
  const taskHomeSeparator = taskHomePath.includes("?") ? "&" : "?";
  const appNav = `<a href="${escapeHtml(taskHomePath)}${taskHomeSeparator}session=${encodeURIComponent(params.session.token)}">Task home</a>`;
  const telemetry = isViewer || isTerminal ? "" : `
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
        --panel-soft: rgba(255, 255, 255, 0.72);
        --page-a: #f7f3ea;
        --page-b: #ece6d9;
        --control: #ffffff;
        --header: rgba(255, 255, 255, 0.68);
        --accent: #0f766e;
        --accent-soft: #d9eee9;
        --button-ink: #ffffff;
        --danger: #a33b2f;
        --radius: 8px;
        --shadow: none;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--ink);
        background: linear-gradient(180deg, var(--page-a) 0%, var(--page-b) 100%);
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
        background: var(--panel-soft);
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
        color: var(--button-ink);
        border-radius: 6px;
        padding: 8px 12px;
        font-weight: 800;
        cursor: pointer;
      }
      select {
        color: var(--ink);
        background: var(--control);
        border-color: var(--line);
      }
      input, textarea, select {
        color: var(--ink) !important;
        background: var(--control) !important;
        border-color: var(--line) !important;
      }
      table { width: 100%; border-collapse: collapse; color: var(--ink); background: var(--panel); }
      th, td { border-bottom: 1px solid var(--line); padding: 10px; text-align: left; }
      .nav { display: flex; gap: 12px; flex-wrap: wrap; }
      .nav a { white-space: nowrap; }
      .score { white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
      .layout-badge { display: inline-block; margin-bottom: 8px; color: var(--muted); font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
      .viewer-banner { margin: 0 24px; padding: 10px 14px; border: 1px solid var(--line); background: var(--accent-soft); color: var(--ink); font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
      .viewer-readonly form, .viewer-readonly a { pointer-events: none; }
      .terminal-readonly form { pointer-events: none; opacity: .58; }
      .terminal-readonly button, .terminal-readonly input, .terminal-readonly textarea, .terminal-readonly select { cursor: not-allowed; }
      .viewer-readonly form { opacity: .58; }
      .viewer-readonly button, .viewer-readonly input, .viewer-readonly textarea, .viewer-readonly select { cursor: not-allowed; }
      .viewer-readonly a { cursor: default; }

      body.theme-dark {
        color-scheme: dark;
        --ink: #f4f1e8;
        --muted: #b9b4aa;
        --line: #484943;
        --surface: #171916;
        --panel: #222520;
        --panel-soft: rgba(34, 37, 32, 0.78);
        --page-a: #111310;
        --page-b: #20251f;
        --control: #161915;
        --header: rgba(22, 25, 21, 0.88);
        --accent: #66d9c7;
        --accent-soft: #183c36;
        --button-ink: #071d19;
        --danger: #ff9387;
        --shadow: 0 16px 38px rgba(0, 0, 0, .22);
      }

      body.ui-sidebar {
        --accent: #b45309;
        --accent-soft: #ffedd5;
        --surface: #f3eee5;
        --radius: 2px;
        --page-a: #f3eee5;
        --page-b: #e6dccb;
      }
      .ui-sidebar .shell { display: grid; grid-template-columns: minmax(250px, 320px) minmax(0, 1fr); min-height: 100vh; }
      .ui-sidebar header { position: sticky; top: 0; height: 100vh; flex-direction: column; justify-content: flex-start; border-right: 1px solid var(--line); background: var(--header); backdrop-filter: blur(12px); }
      .ui-sidebar main { padding: 32px; }
      .ui-sidebar .nav { flex-direction: column; width: 100%; margin-top: auto; }
      .ui-sidebar .nav a { padding: 10px 12px; border: 1px solid var(--line); background: var(--panel-soft); }
      .ui-sidebar .task { background: var(--accent-soft); border-left: 4px solid var(--accent); }
      .theme-dark.ui-sidebar {
        --accent: #ffb45c;
        --accent-soft: #452b12;
        --page-a: #16120d;
        --page-b: #292016;
        --button-ink: #231405;
      }

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
        --page-a: #e7eee9;
        --page-b: #dce6df;
        background: repeating-linear-gradient(0deg, var(--page-a) 0, var(--page-a) 27px, var(--page-b) 28px);
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
      .theme-dark.ui-compact {
        --ink: #e9fff3;
        --muted: #9fb7a8;
        --line: #3e5a49;
        --panel: #15221a;
        --panel-soft: rgba(21, 34, 26, .82);
        --page-a: #0d1711;
        --page-b: #17261c;
        --control: #0d1711;
        --accent: #8ee6ad;
        --accent-soft: #1d3c29;
        --button-ink: #082010;
      }

      body.ui-dashboard {
        --ink: #10223b;
        --muted: #607087;
        --line: #cbd6e4;
        --panel: #ffffff;
        --page-a: #eaf1f8;
        --page-b: #dce8f3;
        --accent: #1769aa;
        --accent-soft: #dceeff;
        --radius: 16px;
        --shadow: 0 12px 30px rgba(45, 76, 112, .12);
      }
      .ui-dashboard .shell { max-width: 1240px; }
      .ui-dashboard header { margin: 18px 24px 0; padding: 22px 26px; align-items: center; border: 1px solid var(--line); border-radius: 18px; background: var(--panel); box-shadow: var(--shadow); }
      .ui-dashboard main { padding-top: 18px; }
      .ui-dashboard .task { border: 0; border-radius: 10px; background: var(--accent-soft); }
      .ui-dashboard .nav a { padding: 9px 12px; border-radius: 999px; background: var(--accent-soft); }
      .theme-dark.ui-dashboard {
        --ink: #e8f3ff;
        --muted: #9eb1c7;
        --line: #30455d;
        --panel: #172536;
        --panel-soft: rgba(23, 37, 54, .82);
        --page-a: #0d1622;
        --page-b: #14263a;
        --control: #0f1b29;
        --accent: #6ebcff;
        --accent-soft: #1d3f60;
        --button-ink: #071725;
      }

      body.ui-editorial {
        --ink: #261b17;
        --muted: #75655d;
        --line: #cdbeb3;
        --panel: #fffdf7;
        --page-a: #f5efe5;
        --page-b: #e8dccd;
        --accent: #9a3412;
        --accent-soft: #f4d8c5;
        --radius: 0;
      }
      .ui-editorial .shell { max-width: 1040px; }
      .ui-editorial header { display: block; padding-top: 42px; border-bottom: 1px solid var(--ink); }
      .ui-editorial h1 { max-width: 760px; font-family: Georgia, "Times New Roman", serif; font-size: clamp(38px, 6vw, 72px); font-weight: 500; letter-spacing: -.035em; }
      .ui-editorial .task { max-width: 760px; padding-left: 0; border: 0; background: transparent; font-family: Georgia, "Times New Roman", serif; font-size: 19px; }
      .ui-editorial .nav { margin-top: 28px; padding: 12px 0; border-top: 1px solid var(--line); }
      .ui-editorial .card, .ui-editorial .panel { border-width: 0 0 1px; }
      .theme-dark.ui-editorial {
        --ink: #fff2e6;
        --muted: #c5aa99;
        --line: #5b4438;
        --panel: #241914;
        --panel-soft: rgba(36, 25, 20, .8);
        --page-a: #140e0b;
        --page-b: #2b1c15;
        --control: #1a110d;
        --accent: #ff9a6c;
        --accent-soft: #4a2517;
        --button-ink: #2a0f05;
      }

      @media (max-width: 720px) {
        header, main { padding: 16px; }
        header { flex-direction: column; }
        .ui-sidebar .shell { display: block; }
        .ui-sidebar header { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); }
        .ui-sidebar main { padding: 16px; }
        .ui-sidebar .nav { flex-direction: row; margin-top: 4px; }
        .ui-compact header { align-items: flex-start; }
        .ui-dashboard header { margin: 10px 12px 0; padding: 18px; }
        .ui-editorial header { padding-top: 28px; }
        .nav { width: 100%; }
      }
    </style>
    ${telemetry}
  </head>
  <body class="ui-${uiVariant} theme-${uiTheme}${isViewer ? " viewer-readonly" : ""}${isTerminal ? " terminal-readonly" : ""}" data-ui-variant="${uiVariant}" data-ui-theme="${uiTheme}">
    <div class="shell">
    ${isViewer ? '<div class="viewer-banner">Live read-only session view</div>' : ""}
    ${isTerminal ? `<div class="viewer-banner">Case ${escapeHtml(params.session.status)} · return to the AgentBench Connection Page to continue${connectionUrl ? ` · <a href="${escapeHtml(connectionUrl)}">Return to Connection Page</a>` : ""}</div>` : ""}
    <header>
      <div class="heading">
        <span class="layout-badge">${escapeHtml(params.session.app)} · ${uiVariant} · ${uiTheme}</span>
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
