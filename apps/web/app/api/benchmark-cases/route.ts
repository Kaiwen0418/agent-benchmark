import { NextResponse } from "next/server";
import {
  listCalibrationBenchmarkRevisions,
  listPublicHostedBenchmarkCases,
} from "@/lib/db";
import { isCalibrationControlsEnabled } from "@/lib/calibration";

export async function GET() {
  try {
    const cases = await listPublicHostedBenchmarkCases();
    if (!isCalibrationControlsEnabled()) {
      return NextResponse.json({ cases, calibration: { enabled: false } });
    }

    const revisions = await listCalibrationBenchmarkRevisions(
      cases.map((benchmarkCase) => benchmarkCase.id),
    );
    return NextResponse.json({
      cases,
      calibration: { enabled: true, revisions },
    });
  } catch (error) {
    console.error("[web] failed to list benchmark cases", error);
    return NextResponse.json(
      { error: "service_unavailable", message: "Failed to load benchmark cases." },
      { status: 503 },
    );
  }
}
