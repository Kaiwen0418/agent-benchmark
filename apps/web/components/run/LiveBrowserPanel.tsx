export function LiveBrowserPanel({ liveViewUrl }: { liveViewUrl: string | null }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4 text-sm font-medium uppercase tracking-[0.18em] text-muted">
        Live Browser
      </div>
      {liveViewUrl ? (
        <iframe
          src={liveViewUrl}
          title="Live browser session"
          className="h-[420px] w-full bg-white"
        />
      ) : (
        <div className="flex h-[420px] items-center justify-center bg-[#f0ece3] text-sm text-muted">
          Live browser iframe placeholder. Runner can later inject a noVNC URL here.
        </div>
      )}
    </div>
  );
}
