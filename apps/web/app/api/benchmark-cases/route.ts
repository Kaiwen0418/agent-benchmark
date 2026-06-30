import { NextResponse } from "next/server";
import { listPublicHostedBenchmarkCases } from "@/lib/db";

export async function GET() {
  try {
    const cases = await listPublicHostedBenchmarkCases();
    return NextResponse.json({ cases });
  } catch (error) {
    console.error("[web] failed to list benchmark cases", error);
    return NextResponse.json(
      { error: "service_unavailable", message: "Failed to load benchmark cases." },
      { status: 503 },
    );
  }
}
