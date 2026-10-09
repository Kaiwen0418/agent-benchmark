import assert from "node:assert/strict";
import test from "node:test";
import { hostedEventDescription, hostedInteractionContext, publicBrowserEventPayload } from "../../lib/hosted-event-details";
import { projectHostedInteraction, safeTelemetryRoute } from "@agentbench/shared/hosted-telemetry";

test("legacy click context exposes safe labels and navigation attempts", () => {
  const payload = { type: "click", url: "/wiki?session=secret", payload: { text: "Open article", href: "/wiki/article/private-id?session=secret" } };
  assert.match(hostedEventDescription(payload, "hosted.action"), /Navigate \(attempt\)/);
  assert.equal(hostedInteractionContext(payload, "hosted.action")?.destination, "/wiki/article/:item");
});

test("input contents and forged labels are removed at the public boundary", () => {
  const secret = "confidential-investigation-marker";
  const payload = { type: "input", title: secret, url: "https://internal:3003/inbox?session=token", payload: { name: "body", value: secret, label: secret }, privateAnswer: secret };
  const projected = publicBrowserEventPayload("hosted.action", payload);
  assert.doesNotMatch(JSON.stringify(projected), /confidential|internal|session=|privateAnswer|token/);
  assert.match(hostedEventDescription(projected, "hosted.action"), /Input: Body.*value redacted/);
  assert.equal(hostedInteractionContext({ type: "click", payload: { text: secret } }, "hosted.action")?.target, null);
});

test("new and legacy contexts remain stable after repeated safe projection", () => {
  const interaction = projectHostedInteraction("click", { text: "Save draft", kind: "submit" }, "/inbox/compose");
  const payload = publicBrowserEventPayload("hosted.action", { type: "click", interaction });
  assert.deepEqual(publicBrowserEventPayload("hosted.action", payload), payload);
  assert.match(hostedEventDescription(payload, "hosted.action"), /Submit: Save draft.*attempted/);
});

test("loaded destinations do not imply a preceding click succeeded", () => {
  const context = hostedInteractionContext({ url: "/shopping/cart", payload: { from: "/shopping?session=x" } }, "hosted.page.load");
  assert.equal(context?.outcome, "loaded");
  assert.equal(context?.from, "/shopping");
  assert.match(hostedEventDescription({ url: "/shopping/cart" }, "hosted.page.load"), /Page loaded: \/shopping\/cart/);
});

test("route filtering removes hosts, queries, fragments and arbitrary path identifiers", () => {
  for (const value of [null, {}, "javascript:alert(1)", "https://internal/api/sessions/token", "/private-token", "/wiki/" + "a".repeat(3000)]) {
    assert.equal(safeTelemetryRoute(value), null);
  }
  assert.equal(safeTelemetryRoute("https://internal:3003/calendar/event/token?q=secret#password"), "/calendar/event/:item");
  assert.equal(safeTelemetryRoute("/notes/secret"), "/notes/:item");
});

test("unknown event context falls back without rendering arbitrary payload JSON", () => {
  assert.equal(hostedEventDescription({ type: "unexpected", payload: { password: "secret" } }, "hosted.action"), "Hosted action (details unavailable)");
  assert.equal(projectHostedInteraction("click", { name: "__proto__", text: "<img onerror=alert(1)>" })?.target, null);
  assert.equal(projectHostedInteraction("input", { name: "tax", kind: "select" })?.contents, "redacted");
  assert.equal(projectHostedInteraction("input", { name: "conflictResolved", kind: "toggle" })?.action, "toggle");
});
