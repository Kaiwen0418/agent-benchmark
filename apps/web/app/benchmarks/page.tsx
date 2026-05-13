import { AppShell } from "@/components/layout/AppShell";
import { BenchmarkCaseList } from "@/components/benchmark/BenchmarkCaseList";
import { listBenchmarkCases } from "@/lib/db";

export default async function BenchmarksPage() {
  const cases = await listBenchmarkCases();

  return (
    <AppShell
      title="Benchmarks"
      description="Public benchmark catalog for the first control-plane milestone."
    >
      <BenchmarkCaseList cases={cases} />
    </AppShell>
  );
}
