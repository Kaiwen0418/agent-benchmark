"use server";

import { redirect } from "next/navigation";
import { createBenchmarkRun } from "@/lib/db";

export async function createRunAction(formData: FormData) {
  const caseId = String(formData.get("caseId") ?? "");
  if (!caseId) {
    throw new Error("caseId is required");
  }

  const run = await createBenchmarkRun({
    caseId,
    userId: null,
  });

  redirect(`/runs/${run.id}`);
}
