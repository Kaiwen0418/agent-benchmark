import assert from "node:assert/strict";
import test from "node:test";
import { layout } from "./templates.js";
import type { HostedSession } from "./runtime/types.js";

function makeSession(uiVariant: "workspace" | "sidebar" | "compact") {
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
        taskConfig: {},
      },
    },
  } as unknown as HostedSession;
}

for (const uiVariant of ["workspace", "sidebar", "compact"] as const) {
  test(`layout renders the ${uiVariant} UI variant without target-specific navigation`, () => {
    const html = layout({
      title: "Generated Wiki",
      session: makeSession(uiVariant),
      body: '<section class="panel">Body</section>',
      publicBaseUrl: "http://localhost:3003",
      defaultStartPathForApp: () => "/wiki",
    });

    assert.match(html, new RegExp(`class="ui-${uiVariant}"`));
    assert.match(html, new RegExp(`data-ui-variant="${uiVariant}"`));
    assert.match(html, /Knowledge base/);
    assert.doesNotMatch(html, /Release History|Battery Thread|Edit README/);
  });
}
