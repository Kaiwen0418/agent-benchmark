// Isolated browser fixture: real event rows and safe projection, no database or polling.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { RunEventRow } from "../../components/landing/RunEventRow";
import { hostedEventDescription, hostedInteractionContext } from "../../lib/hosted-event-details";

Object.assign(globalThis, { React });
const cssDirectory = join(process.cwd(), ".next/static/css");
const css = readdirSync(cssDirectory).filter((name) => name.endsWith(".css"))
  .map((name) => readFileSync(join(cssDirectory, name), "utf8")).join("\n");
const samples = [
  { type: "click", url: "/shopping", payload: { text: "Add to cart" } },
  { type: "input", url: "/sheets", payload: { name: "tax", value: "do-not-display" } },
  { type: "click", url: "/wiki", payload: { text: "Open article", href: "/wiki/article/private-id?session=do-not-display" } },
  { type: "page.load", url: "/wiki/article/private-id", payload: { from: "/wiki" } },
  { type: "input", url: "/shopping/cart", payload: { name: "shippingMethod", kind: "select" } },
  { type: "submit", url: "/inbox/compose", payload: { text: "Save draft" } },
  { type: "unknown", payload: { secret: "do-not-display" } },
];
const page = renderToStaticMarkup(React.createElement("main", {
  className: "mx-auto max-w-xl space-y-4 p-4",
}, React.createElement("h1", null, "Latest Events"),
...samples.map((payload, index) => {
  const type = payload.type === "page.load" ? "hosted.page.load" : "hosted.action";
  return React.createElement(RunEventRow, {
    key: index, label: type, timestamp: "08:11:45",
    detail: hostedEventDescription(payload, type),
    interaction: hostedInteractionContext(payload, type) ?? undefined,
  });
})));
const guidance = process.argv[2] ? readFileSync(process.argv[2], "utf8") : "";
const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const server = createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Run UI fixture</title><style>${css}</style></head><body>${page}<section style="max-width:36rem;margin:1rem auto;padding:1rem"><h2>Generated suite instructions</h2><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(guidance)}</pre></section></body></html>`);
});
server.listen(3197, "127.0.0.1", () => console.log("Isolated run UI fixture: http://127.0.0.1:3197"));
