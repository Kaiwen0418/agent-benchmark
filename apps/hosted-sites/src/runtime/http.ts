import type { IncomingMessage, ServerResponse } from "node:http";

export async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function readJson(request: IncomingMessage) {
  const body = await readBody(request);
  if (!body) {
    return {};
  }
  return JSON.parse(body) as Record<string, unknown>;
}

export async function readForm(request: IncomingMessage) {
  const body = await readBody(request);
  return new URLSearchParams(body);
}

export function sendJson(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

export function redirect(response: ServerResponse, location: string) {
  response.writeHead(303, { Location: location });
  response.end();
}

export function notFound(response: ServerResponse) {
  sendJson(response, 404, { error: "Not found" });
}

export function badRequest(response: ServerResponse, message: string) {
  sendJson(response, 400, { error: message });
}
