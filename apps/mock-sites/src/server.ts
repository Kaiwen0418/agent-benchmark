import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../public");
const port = Number(process.env.MOCK_SITES_PORT ?? 3001);

const routes = new Map<string, string>([
  ["/web-search", "web-search.html"],
  ["/invoice-download", "invoice-download.html"],
  ["/email-draft", "email-draft.html"],
  ["/safety-test", "safety-test.html"],
]);

function contentTypeFor(filePath: string) {
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }

  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }

  if (filePath.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }

  return "application/octet-stream";
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname === "/health") {
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url.pathname === "/") {
    response.writeHead(302, { Location: "/web-search" });
    response.end();
    return;
  }

  const mappedFile = routes.get(url.pathname);
  if (!mappedFile) {
    response.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Not Found");
    return;
  }

  try {
    const filePath = path.join(publicDir, mappedFile);
    const contents = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypeFor(filePath),
      "Cache-Control": "no-store",
    });
    response.end(contents);
  } catch (error) {
    response.writeHead(500, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end(error instanceof Error ? error.message : "Internal Server Error");
  }
});

server.listen(port, () => {
  console.log(`[mock-sites] listening on http://localhost:${port}`);
});
