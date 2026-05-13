import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

const RUNNER_SECRET_HEADER = "x-runner-secret";

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

export function requireRunnerAuth(request: Request) {
  const configuredSecret = process.env.RUNNER_SHARED_SECRET;

  if (!configuredSecret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "RUNNER_SHARED_SECRET is not configured" },
        { status: 500 },
      );
    }

    return null;
  }

  const providedSecret = request.headers.get(RUNNER_SECRET_HEADER);
  if (!providedSecret || !safeEqual(providedSecret, configuredSecret)) {
    return NextResponse.json({ error: "Unauthorized runner request" }, { status: 401 });
  }

  return null;
}
