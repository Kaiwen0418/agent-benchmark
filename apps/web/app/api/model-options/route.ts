import { NextResponse } from "next/server";
import { searchModelCatalog } from "@/lib/model-catalog";
import { SupabaseServiceUnavailableError } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
  const requestedLimit = Number(url.searchParams.get("limit") ?? 12);
  const limit = Number.isInteger(requestedLimit)
    ? Math.max(1, Math.min(requestedLimit, 25))
    : 12;

  if (query.length < 2) {
    return NextResponse.json({ models: [] }, {
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" },
    });
  }

  try {
    const models = await searchModelCatalog(query, limit);
    return NextResponse.json({ models }, {
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" },
    });
  } catch (error) {
    console.error("[web] model catalog search failed", error);
    const message = error instanceof SupabaseServiceUnavailableError
      ? error.message
      : "Model suggestions are temporarily unavailable.";
    return NextResponse.json(
      { error: "model_catalog_unavailable", message },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
