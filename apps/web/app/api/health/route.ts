import { NextResponse } from "next/server";
import { checkWebDatabaseReadiness } from "@/lib/database";

export async function GET() {
  try {
    await checkWebDatabaseReadiness();
    return NextResponse.json(
      { status: "ok", service: "web" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[web] database readiness check failed", error);
    return NextResponse.json(
      { status: "unavailable", service: "web" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
