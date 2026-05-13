export function TopNav() {
  const items = [
    { href: "#playground", label: "How it works" },
    { href: "#gallery", label: "Replay Gallery" },
    { href: "#docs", label: "Docs" },
    { href: "#playground", label: "Start Run" },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-[#dbd3c5]/80 bg-[#f7f4ec]/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-10 lg:px-16">
        <a href="#hero" className="text-sm font-medium uppercase tracking-[0.22em] text-[#111111]">
          AgentBench
        </a>
        <div className="hidden items-center gap-6 text-sm text-[#5f594e] md:flex">
          {items.map((item) => (
            <a key={item.label} href={item.href}>
              {item.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}
