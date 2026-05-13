import Link from "next/link";
import type { ReactNode } from "react";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/benchmarks", label: "Benchmarks" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export function AppShell({
  title,
  children,
  description,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-semibold text-foreground">
            AgentBench Control Plane
          </Link>
          <nav className="flex gap-5 text-sm text-muted">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="max-w-3xl text-sm text-muted">{description}</p> : null}
        </div>
        {children}
      </main>
    </div>
  );
}
