import assert from "node:assert/strict";
import test from "node:test";
import { layout } from "../../src/templates.js";
import type { HostedSession } from "../../src/runtime/types.js";

type UiVariant = "workspace" | "sidebar" | "compact" | "dashboard" | "editorial";
type UiTheme = "light" | "dark";

function makeSession(uiVariant: UiVariant, uiTheme: UiTheme, scorePreviewMode: HostedSession["scorePreviewMode"] = "dev") {
  return {
    app: "wiki-lite",
    token: "tok_layout",
    taskSlug: "wiki-generated",
    goal: "Find and submit the requested value.",
    scorePreviewMode,
    metadata: {
      questionGeneration: {
        schemaVersion: 1,
        generationSeed: "layout-seed",
        variantId: "wiki-test",
        uiVariant,
        uiTheme,
        taskConfig: {},
      },
    },
  } as unknown as HostedSession;
}

for (const uiVariant of ["workspace", "sidebar", "compact", "dashboard", "editorial"] as const) {
  for (const uiTheme of ["light", "dark"] as const) {
    test(`layout renders the ${uiVariant}/${uiTheme} presentation without target-specific navigation`, () => {
      const html = layout({
        title: "Generated Wiki",
        session: makeSession(uiVariant, uiTheme),
        body: '<section class="panel">Body</section>',
        publicBaseUrl: "http://localhost:3003",
        defaultStartPathForApp: () => "/wiki",
      });

      assert.match(html, new RegExp(`class="ui-${uiVariant} theme-${uiTheme}"`));
      assert.match(html, new RegExp(`data-ui-variant="${uiVariant}"`));
      assert.match(html, new RegExp(`data-ui-theme="${uiTheme}"`));
      assert.match(html, new RegExp(`${uiVariant} · ${uiTheme}`));
      assert.match(html, /Task home/);
      assert.match(html, /href="\/wiki\?session=tok_layout"/);
      assert.doesNotMatch(html, /Release History|Battery Thread|Edit README/);
    });
  }
}

test("viewer layout disables navigation and mutations while retaining the read-only marker", () => {
  const session = makeSession("workspace", "light");
  session.accessMode = "viewer";

  const html = layout({
    title: "Generated Wiki",
    session,
    body: '<form><button type="submit">Submit</button></form>',
    publicBaseUrl: "http://localhost:3003",
    defaultStartPathForApp: () => "/wiki",
  });

  assert.match(html, /class="ui-workspace theme-light viewer-readonly"/);
  assert.match(html, /Live read-only session view/);
  assert.match(html, /\.viewer-readonly form, \.viewer-readonly a \{ pointer-events: none; \}/);
  assert.doesNotMatch(html, /window\.AgentBenchHostedSession/);
});

test("terminal layout disables forms and does not emit telemetry", () => {
  const session = makeSession("workspace", "light");
  session.status = "failed";
  session.runId = "run-1";
  const html = layout({
    title: "Terminal task",
    session,
    body: '<form method="post"><button>Retry</button></form>',
    publicBaseUrl: "http://localhost:3003",
    defaultStartPathForApp: () => "/wiki",
  });

  assert.match(html, /terminal-readonly/);
  assert.match(html, /return to the AgentBench Connection Page to continue/);
  assert.match(html, /href="http:\/\/localhost:3000\/runs\/run-1\/connect"/);
  assert.doesNotMatch(html, /abTelemetry/);
});

test("layout never renders Score JSON link", () => {
  for (const scorePreviewMode of ["dev", "token", "disabled"] as const) {
    const session = makeSession("workspace", "light", scorePreviewMode);
    const html = layout({
      title: "No score preview",
      session,
      body: '<section class="panel">Body</section>',
      publicBaseUrl: "http://localhost:3003",
      defaultStartPathForApp: () => "/wiki",
    });

    assert.doesNotMatch(html, /Score JSON/);
    assert.doesNotMatch(html, /href="\/api\/sessions\/tok_layout\/score"/);
  }

  const viewerSession = makeSession("workspace", "light", "token");
  viewerSession.accessMode = "viewer";
  const viewerHtml = layout({
    title: "Viewer preview",
    session: viewerSession,
    body: '<section class="panel">Body</section>',
    publicBaseUrl: "http://localhost:3003",
    defaultStartPathForApp: () => "/wiki",
  });
  assert.doesNotMatch(viewerHtml, /Score JSON/);

  const terminalSession = makeSession("workspace", "light", "disabled");
  terminalSession.status = "failed";
  const terminalHtml = layout({
    title: "Terminal disabled preview",
    session: terminalSession,
    body: '<section class="panel">Body</section>',
    publicBaseUrl: "http://localhost:3003",
    defaultStartPathForApp: () => "/wiki",
  });
  assert.doesNotMatch(terminalHtml, /Score JSON/);
});

test("input telemetry records field identity without capturing typed values", () => {
  const html = layout({
    title: "Telemetry privacy",
    session: makeSession("workspace", "light"),
    body: '<input name="confidential" />',
    publicBaseUrl: "http://localhost:3003",
    defaultStartPathForApp: () => "/wiki",
  });

  assert.match(html, /target\.getAttribute\("name"\)/);
  assert.doesNotMatch(html, /valuePreview|target\.value/);
});
