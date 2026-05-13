import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/layout/SectionCard";
import { isSupabaseEnabled } from "@/lib/auth";

export default function LoginPage() {
  return (
    <AppShell
      title="Login"
      description="Supabase Auth entry point placeholder. This page is intentionally structural first."
    >
      <SectionCard title="Auth">
        <div className="space-y-3 text-sm text-muted">
          <p>
            {isSupabaseEnabled()
              ? "Supabase environment variables are present. Next step is wiring real auth actions and session-aware UI."
              : "Supabase is not configured yet. Add env vars to switch from mock mode to real auth."}
          </p>
          <p>Planned flows: email magic link, OAuth providers, profile bootstrap, protected dashboard routes.</p>
        </div>
      </SectionCard>
    </AppShell>
  );
}
