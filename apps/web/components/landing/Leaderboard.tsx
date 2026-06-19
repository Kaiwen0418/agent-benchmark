import { listPublicLeaderboard, listPublicLeaderboardVersions } from "@/lib/db";
import { LeaderboardRanking, type LeaderboardBoard } from "./LeaderboardRanking";

async function loadBoards(): Promise<LeaderboardBoard[]> {
  const versions = await listPublicLeaderboardVersions();
  if (versions.length === 0) {
    return [{ version: "all", entries: await listPublicLeaderboard(20) }];
  }

  return Promise.all(versions.map(async (version) => ({
    version,
    entries: await listPublicLeaderboard(20, version),
  })));
}

export async function Leaderboard() {
  const boards = await loadBoards().catch((error) => {
    console.error("[web] failed to load public leaderboard", error);
    return [{ version: "all", entries: [] }];
  });

  return (
    <section id="leaderboard" className="min-h-screen px-6 py-24 md:px-10 lg:px-16 snap-start">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 grid gap-6 lg:grid-cols-[1fr_0.7fr] lg:items-end">
          <div className="max-w-3xl">
            <div className="text-xs uppercase tracking-[0.24em] text-[#726b5f]">Public leaderboard</div>
            <h2 className="mt-3 text-4xl font-medium tracking-[-0.05em] text-[#111111] md:text-6xl">
              Results, ranked with their runtime context.
            </h2>
          </div>
          <p className="max-w-xl text-base leading-7 text-[#66625a] lg:justify-self-end">
            Completed public runs are ranked within the same benchmark version. Agent and model identities are self-reported; browser environment and completion time are captured by AgentBench.
          </p>
        </div>

        <LeaderboardRanking boards={boards} />
      </div>
    </section>
  );
}
