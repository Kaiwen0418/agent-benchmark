import { replayCards } from "./data";

export function ReplayGallery() {
  return (
    <section id="gallery" className="min-h-screen px-6 py-24 md:px-10 lg:px-16 snap-start">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 max-w-2xl">
          <div className="text-xs uppercase tracking-[0.24em] text-[#726b5f]">Replay Gallery</div>
          <h2 className="mt-3 text-4xl font-medium tracking-[-0.05em] text-[#111111] md:text-5xl">
            Replays should feel watchable, not archival.
          </h2>
          <p className="mt-4 text-lg leading-8 text-[#66625a]">
            Successful runs, failed runs, funny runs, and dangerous runs all belong in the same gallery. The replay is part of the product, not an afterthought.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {replayCards.map((card) => (
            <article key={card.title} className="overflow-hidden rounded-[2rem] border border-[#dad3c6] bg-white">
              <div className="h-52 bg-[linear-gradient(135deg,#efe7d1,#d6c8ae_55%,#111111)]" />
              <div className="p-5">
                <div className="mb-3 inline-flex rounded-full bg-[#efede6] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#6c6559]">
                  {card.tag}
                </div>
                <h3 className="text-xl font-medium text-[#111111]">{card.title}</h3>
                <div className="mt-4 flex items-center justify-between text-sm text-[#66625a]">
                  <span>{card.benchmark}</span>
                  <span>{card.duration}</span>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-3xl font-medium text-[#111111]">{card.score}</div>
                  <button type="button" className="rounded-full bg-[#111111] px-4 py-2 text-sm text-white">
                    Watch Replay
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
