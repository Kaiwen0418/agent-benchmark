import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer);
}

export function requireModelCatalogSyncAuth(request: Request) {
  const configuredSecret = process.env.MODEL_CATALOG_SYNC_SECRET;
  if (!configuredSecret) {
    return NextResponse.json(
      { error: "model_catalog_sync_unconfigured" },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization");
  const providedSecret = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!providedSecret || !safeEqual(providedSecret, configuredSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return null;
}
