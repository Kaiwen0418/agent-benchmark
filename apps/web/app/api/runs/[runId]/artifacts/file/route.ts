import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getBenchmarkRun, resolveLocalArtifactFile } from "@/lib/db";

function getMimeType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".pdf":
      return "application/pdf";
    case ".txt":
    case ".md":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const run = await getBenchmarkRun(runId);

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const storagePath = new URL(request.url).searchParams.get("path");
  if (!storagePath) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const absolutePath = resolveLocalArtifactFile(runId, storagePath);
  if (!absolutePath) {
    return NextResponse.json({ error: "Invalid artifact path" }, { status: 400 });
  }

  try {
    const data = await fs.readFile(absolutePath);
    return new Response(data, {
      headers: {
        "Content-Type": getMimeType(absolutePath),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }
}
