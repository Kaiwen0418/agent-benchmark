import { NextResponse } from "next/server";
import { submitRunMetadataInputSchema } from "@agentbench/protocol";
import {
  InvalidModelCatalogSelectionError,
  submitBenchmarkRunMetadata,
} from "@/lib/db";
import { captureBrowserEnvironment } from "@/lib/run-metadata";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const input = submitRunMetadataInputSchema.parse(await request.json());
  let run;
  try {
    run = await submitBenchmarkRunMetadata(runId, input, captureBrowserEnvironment(request.headers));
  } catch (error) {
    if (error instanceof InvalidModelCatalogSelectionError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message.includes("locked")) {
      return NextResponse.json({ error: "run_metadata_locked", message: error.message }, { status: 409 });
    }
    throw error;
  }

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json({ run }, { headers: { "Cache-Control": "no-store" } });
}
