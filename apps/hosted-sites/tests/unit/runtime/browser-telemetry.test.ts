import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { browserTelemetryScript } from "../../../src/runtime/browser-telemetry.js";

function browser() {
  const handlers = new Map<string, (event: any) => void>();
  const timers = new Map<number, () => void>();
  const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const storage = new Map<string, string>();
  let timerId = 0;
  const register = (name: string, handler: (event: any) => void) => handlers.set(name, handler);
  vm.runInNewContext(browserTelemetryScript(), {
    window: { addEventListener: register }, document: { addEventListener: register },
    sessionStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) },
    location: { pathname: "/inbox/compose", origin: "https://hosted.example" }, URL, Date,
    setTimeout: (callback: () => void) => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: (id: number) => timers.delete(id),
    abTelemetry: (type: string, payload: Record<string, unknown>) => events.push({ type, payload }),
  });
  return { handlers, timers, events, storage };
}

function field(name: string, type = "text", tagName = "INPUT") {
  return {
    tagName, type, labels: [{ textContent: "confidential label" }],
    getAttribute: (key: string) => key === "name" ? name : null,
    get value(): never { throw new Error("Input contents must not be read"); },
  };
}

test("typing bursts coalesce and flush without reading contents", () => {
  const runtime = browser();
  const target = field("body");
  for (let i = 0; i < 100; i++) runtime.handlers.get("input")!({ target });
  assert.equal(runtime.events.length, 0);
  assert.equal(runtime.timers.size, 1);
  runtime.handlers.get("focusout")!({});
  assert.equal(runtime.events.length, 1);
  assert.equal(runtime.events[0].payload.label, "Body");
  assert.doesNotMatch(JSON.stringify(runtime.events), /confidential|value/);
  assert.equal(runtime.timers.size, 0);
});

test("password and hidden fields are excluded; change kinds retain the input cost type", () => {
  const runtime = browser();
  runtime.handlers.get("input")!({ target: field("password", "password") });
  runtime.handlers.get("input")!({ target: field("session", "hidden") });
  runtime.handlers.get("change")!({ target: field("decision", "select-one", "SELECT") });
  runtime.handlers.get("pagehide")!({});
  assert.equal(runtime.events.length, 1);
  assert.equal(runtime.events[0].type, "input");
  assert.equal(runtime.events[0].payload.kind, "select");
});

test("clicks on submit buttons avoid duplicate submit events", () => {
  const runtime = browser();
  const button = Object.assign(field("", "submit", "BUTTON"), { innerText: "Save draft", form: {} });
  runtime.handlers.get("click")!({ target: { closest: () => button } });
  runtime.handlers.get("submit")!({ submitter: button });
  assert.equal(runtime.events.length, 1);
  assert.equal(runtime.events[0].payload.kind, "submit");
  assert.equal(runtime.events[0].payload.text, "Save draft");
});

test("page history stores only logical paths and click labels use an allowlist", () => {
  const runtime = browser();
  runtime.handlers.get("load")!({});
  assert.equal(runtime.storage.get("agentbench.telemetry.previousPath"), "/inbox/compose");
  const link = Object.assign(field("", "", "A"), { innerText: "private note title", getAttribute: (key: string) => key === "href" ? "/notes/edit/token?session=secret" : null });
  runtime.handlers.get("click")!({ target: { closest: () => link } });
  assert.equal(runtime.events[1].payload.text, null);
  assert.equal(runtime.events[1].payload.href, "/notes/edit/:item");
});
