import { NextRequest, NextResponse } from "next/server";
import { handlers, isAuthRuntimeConfigured } from "@/auth";

function unavailable() {
  return NextResponse.json(
    { error: "authentication_unavailable" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export function GET(request: NextRequest) {
  return isAuthRuntimeConfigured() ? handlers.GET(request) : unavailable();
}

export function POST(request: NextRequest) {
  return isAuthRuntimeConfigured() ? handlers.POST(request) : unavailable();
}
