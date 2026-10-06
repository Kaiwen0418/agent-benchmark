import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAuthSignInEnabled, signIn, signOut } from "@/auth";
import {
  getClaimableGuestId,
  getCurrentUser,
  GUEST_COOKIE_NAME,
} from "@/lib/auth";
import { getAuthIdentityRepository } from "@/lib/database";

export const dynamic = "force-dynamic";

async function startGithubSignIn() {
  "use server";
  if (!isAuthSignInEnabled()) redirect("/account?error=unavailable");
  await signIn("github", { redirectTo: "/account" });
}

async function endSession() {
  "use server";
  await signOut({ redirectTo: "/" });
}

async function claimGuestRuns() {
  "use server";
  const [user, guestId] = await Promise.all([
    getCurrentUser(),
    getClaimableGuestId(),
  ]);
  if (!user) redirect("/account?error=unauthorized");
  if (!guestId) redirect("/account?error=no-guest");

  const claimed = await getAuthIdentityRepository().claimGuestOwnership({
    userId: user.id,
    guestId,
  });
  const cookieStore = await cookies();
  cookieStore.delete(GUEST_COOKIE_NAME);
  redirect(`/account?claimed=${claimed}`);
}

async function deleteAccount(formData: FormData) {
  "use server";
  const user = await getCurrentUser();
  if (!user) redirect("/account?error=unauthorized");
  if (formData.get("confirmation") !== "DELETE") {
    redirect("/account?error=confirmation");
  }

  await getAuthIdentityRepository().deleteIdentity(user.id);
  await signOut({ redirectTo: "/account?deleted=1" });
}

const messages: Record<string, string> = {
  unavailable: "GitHub sign-in is not configured for this environment.",
  unauthorized: "Sign in before changing account ownership.",
  "no-guest": "No signed guest history is available to claim.",
  confirmation: "Type DELETE exactly to remove the account.",
  OAuthAccountNotLinked: "This email is already owned by another identity and could not be linked.",
  AccessDenied: "GitHub did not provide a verified email address.",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; claimed?: string; deleted?: string }>;
}) {
  const [params, user, claimableGuestId] = await Promise.all([
    searchParams,
    getCurrentUser(),
    getClaimableGuestId(),
  ]);
  const message = params.error ? messages[params.error] ?? "Authentication failed." : null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fffdf8_0%,#f7f4ec_44%,#efe8db_100%)] px-6 py-12 text-[#111111] md:px-10">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-xs font-medium uppercase tracking-[0.24em] text-[#5f594e]">
          AgentBench / Account
        </Link>

        <section className="mt-10 border border-[#cfc5b5] bg-[#fffdf8]/90 p-7 shadow-[8px_8px_0_#d7ff00] md:p-10">
          <p className="text-xs uppercase tracking-[0.28em] text-[#6f685d]">Identity control</p>
          <h1 className="mt-4 text-4xl font-medium tracking-[-0.04em] md:text-6xl">
            {user ? "Account connected." : "Keep guest mode, or sign in."}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[#5f594e]">
            Guest runs remain isolated by default. Signing in does not claim them automatically;
            ownership moves only when you explicitly use the claim action below.
          </p>

          {message ? (
            <p className="mt-6 border-l-4 border-[#111111] bg-[#f1eadf] px-4 py-3 text-sm" role="alert">
              {message}
            </p>
          ) : null}
          {params.claimed ? (
            <p className="mt-6 border-l-4 border-[#d7ff00] bg-[#111111] px-4 py-3 text-sm text-white" role="status">
              Claimed {params.claimed} guest run{params.claimed === "1" ? "" : "s"}.
            </p>
          ) : null}
          {params.deleted === "1" ? (
            <p className="mt-6 border-l-4 border-[#d7ff00] bg-[#111111] px-4 py-3 text-sm text-white" role="status">
              Account deleted. Signing in again will create a new AgentBench identity.
            </p>
          ) : null}

          {!user ? (
            <form action={startGithubSignIn} className="mt-8">
              <button
                type="submit"
                disabled={!isAuthSignInEnabled()}
                className="rounded-full bg-[#111111] px-6 py-3 text-sm font-medium text-white transition hover:bg-[#d7ff00] hover:text-[#111111] disabled:cursor-not-allowed disabled:bg-[#aaa397]"
              >
                Continue with GitHub
              </button>
            </form>
          ) : (
            <div className="mt-8 space-y-8">
              <div className="grid gap-4 border-y border-[#d8d0c3] py-6 text-sm md:grid-cols-2">
                <div>
                  <span className="block text-xs uppercase tracking-[0.2em] text-[#7c7569]">Name</span>
                  <span className="mt-2 block">{user.name ?? "Not provided"}</span>
                </div>
                <div>
                  <span className="block text-xs uppercase tracking-[0.2em] text-[#7c7569]">Verified email</span>
                  <span className="mt-2 block">{user.email ?? "Not provided"}</span>
                </div>
              </div>

              {claimableGuestId ? (
                <form action={claimGuestRuns}>
                  <h2 className="text-xl font-medium">Guest history found</h2>
                  <p className="mt-2 text-sm leading-6 text-[#5f594e]">
                    Move runs from this browser&apos;s signed guest identity into this account.
                    The action is idempotent and cannot claim another guest identity.
                  </p>
                  <button type="submit" className="mt-4 rounded-full border border-[#111111] px-5 py-2.5 text-sm hover:bg-[#111111] hover:text-white">
                    Claim guest runs
                  </button>
                </form>
              ) : null}

              <form action={endSession}>
                <button type="submit" className="text-sm underline underline-offset-4">
                  Sign out
                </button>
              </form>

              <form action={deleteAccount} className="border-t border-[#d8d0c3] pt-8">
                <h2 className="text-xl font-medium">Delete identity</h2>
                <p className="mt-2 text-sm leading-6 text-[#5f594e]">
                  Provider accounts, sessions, and profile data are deleted. Benchmark results are
                  retained without user ownership so public scoring history remains reproducible.
                  You may sign in again later, but that creates a new AgentBench identity.
                </p>
                <label className="mt-4 block max-w-xs text-xs uppercase tracking-[0.18em] text-[#6f685d]">
                  Type DELETE
                  <input
                    name="confirmation"
                    autoComplete="off"
                    className="mt-2 w-full border border-[#a99f91] bg-white px-3 py-2 text-sm normal-case tracking-normal outline-none focus:border-[#111111]"
                  />
                </label>
                <button type="submit" className="mt-4 rounded-full bg-[#a22b1f] px-5 py-2.5 text-sm text-white hover:bg-[#7f1f17]">
                  Delete account
                </button>
              </form>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
