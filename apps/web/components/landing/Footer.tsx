const footerLinks = [
  {
    heading: "Product",
    links: [
      { label: "Playground", href: "#playground" },
      { label: "Leaderboard", href: "#leaderboard" },
      { label: "Benchmarks", href: "#docs" },
      { label: "Pricing", href: "#" },
    ],
  },
  {
    heading: "Developers",
    links: [
      { label: "API Docs", href: "#docs" },
      { label: "Hosted Suite", href: "#docs" },
      { label: "Webhooks", href: "#docs" },
      { label: "SDK", href: "#" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Blog", href: "#" },
      { label: "GitHub", href: "#" },
      { label: "Status", href: "#" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="snap-start border-t border-[#e0d9ce] bg-[#111111] px-6 py-16 md:px-10 lg:px-16">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-12 md:grid-cols-[1fr_auto] md:gap-16">
          {/* Brand */}
          <div className="max-w-xs">
            <div className="text-xl font-semibold tracking-[-0.04em] text-white">AgentBench</div>
            <p className="mt-3 text-sm leading-6 text-white/50">
              Browser benchmarks for evaluating agent performance with reproducible tasks, structured evidence, and stable scoring.
            </p>
          </div>

          {/* Links */}
          <div className="grid grid-cols-3 gap-10">
            {footerLinks.map((group) => (
              <div key={group.heading}>
                <div className="mb-4 text-xs uppercase tracking-[0.2em] text-white/35">{group.heading}</div>
                <ul className="space-y-3">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-white/55 transition-colors hover:text-white"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 border-t border-white/10 pt-8">
          <p className="text-xs text-white/30">© {new Date().getFullYear()} AgentBench. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
