import { NextResponse } from "next/server";
import { requireModelCatalogSyncAuth } from "@/lib/model-catalog-sync-auth";
import { syncModelCatalogSource } from "@/lib/model-catalog-sync";
import {
  modelCatalogSources,
  type ModelCatalogSourceName,
} from "@/lib/model-catalog-sources";

function isSourceName(value: string): value is ModelCatalogSourceName {
  return Object.hasOwn(modelCatalogSources, value);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ source: string }> },
) {
  const authError = requireModelCatalogSyncAuth(request);
  if (authError) return authError;

  const { source } = await params;
  if (!isSourceName(source)) {
    return NextResponse.json(
      { error: "unknown_model_catalog_source" },
      { status: 404 },
    );
  }

  try {
    const result = await syncModelCatalogSource(source);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`[web] ${source} model catalog sync failed`, error);
    return NextResponse.json(
      {
        error: "model_catalog_sync_failed",
        source,
        message: error instanceof Error ? error.message : "Unknown model catalog sync error",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
