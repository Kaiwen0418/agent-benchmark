import assert from "node:assert/strict";
import test from "node:test";
import { layout } from "./templates.js";
import type { HostedSession } from "./runtime/types.js";

type UiVariant = "workspace" | "sidebar" | "compact" | "dashboard" | "editorial";
type UiTheme = "light" | "dark";

function makeSession(uiVariant: UiVariant, uiTheme: UiTheme) {
  return {
    app: "wiki-lite",
    token: "tok_layout",
    taskSlug: "wiki-generated",
    goal: "Find and submit the requested value.",
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
      assert.match(html, /Knowledge base/);
      assert.doesNotMatch(html, /Release History|Battery Thread|Edit README/);
    });
  }
}
