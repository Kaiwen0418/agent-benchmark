import { NextResponse } from "next/server";
import { agentCatalog } from "@/lib/agent-catalog";

export async function GET() {
  return NextResponse.json(agentCatalog, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}
