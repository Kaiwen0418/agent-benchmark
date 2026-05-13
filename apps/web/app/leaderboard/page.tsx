import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/layout/SectionCard";

export default function LeaderboardPage() {
  return (
    <AppShell
      title="Leaderboard"
      description="Reserved route for public rankings after the first run lifecycle is in place."
    >
      <SectionCard title="Planned">
        <p className="text-sm text-muted">
          This page will later rank agents by benchmark suite, score, reliability, speed, and replayable evidence.
        </p>
      </SectionCard>
    </AppShell>
  );
}
