import { NextResponse } from "next/server";
import { getBenchmarkRun } from "@/lib/db";
import { getMcpUpstreamBase, verifyMcpSessionToken } from "@/lib/mcp-session";

async function proxyToUpstream(request: Request, runId: string) {
  const upstreamBase = getMcpUpstreamBase(new URL(request.url).origin);
  if (!upstreamBase) {
    return NextResponse.json({ error: "MCP upstream is not configured" }, { status: 503 });
  }

  const target = `${upstreamBase}?runId=${encodeURIComponent(runId)}`;
  const body =
    request.method === "POST" ? Buffer.from(await request.arrayBuffer()) : undefined;

  const response = await fetch(target, {
    method: request.method,
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
      accept: request.headers.get("accept") ?? "application/json, text/event-stream",
      "x-agentbench-run-id": runId,
      ...(request.headers.get("x-agentbench-mcp-session-id")
        ? {
            "x-agentbench-mcp-session-id":
              request.headers.get("x-agentbench-mcp-session-id") ?? "",
          }
        : {}),
    },
    body,
  });

  const responseBody = await response.arrayBuffer();
  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  return new NextResponse(responseBody, {
    status: response.status,
    headers,
  });
}

async function authorize(request: Request, runId: string) {
  const run = await getBenchmarkRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }

  const token = authorization.slice("Bearer ".length);
  const verification = verifyMcpSessionToken(token, runId);
  if (!verification.ok) {
    return NextResponse.json(
      { error: "Invalid MCP session token", reason: verification.reason },
      { status: 401 },
    );
  }

  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const authError = await authorize(request, runId);
  if (authError) {
    return authError;
  }

  return proxyToUpstream(request, runId);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const authError = await authorize(request, runId);
  if (authError) {
    return authError;
  }

  return proxyToUpstream(request, runId);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const authError = await authorize(request, runId);
  if (authError) {
    return authError;
  }

  return proxyToUpstream(request, runId);
}

