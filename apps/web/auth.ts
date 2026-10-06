import { DrizzleAdapter } from "@auth/drizzle-adapter";
import type { Adapter } from "next-auth/adapters";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { authTables } from "@agentbench/database";
import {
  getAuthIdentityRepository,
  getWebDatabaseClient,
  isWebDatabaseConfigured,
} from "@/lib/database";

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function isAuthRuntimeConfigured() {
  return Boolean(process.env.AUTH_SECRET && isWebDatabaseConfigured());
}

export function isAuthSignInEnabled() {
  return Boolean(
    isAuthRuntimeConfigured() &&
    process.env.AUTH_GITHUB_ID &&
    process.env.AUTH_GITHUB_SECRET &&
    process.env.AUTH_SIGN_IN_MODE === "open",
  );
}

export async function isVerifiedGithubEmail(
  accessToken: string,
  expectedEmail: string,
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher("https://api.github.com/user/emails", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "agentbench-auth",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) return false;

  const emails = await response.json().catch(() => null);
  if (!Array.isArray(emails)) return false;
  const normalizedExpected = expectedEmail.trim().toLowerCase();
  return emails.some((entry) => (
    entry &&
    typeof entry === "object" &&
    "email" in entry &&
    typeof entry.email === "string" &&
    entry.email.trim().toLowerCase() === normalizedExpected &&
    "verified" in entry &&
    entry.verified === true
  ));
}

function databaseAdapter(): Adapter | undefined {
  if (!isWebDatabaseConfigured()) return undefined;
  const adapter = DrizzleAdapter(getWebDatabaseClient().db, authTables);
  const linkAccount = adapter.linkAccount;
  if (!linkAccount) return adapter;

  return {
    ...adapter,
    // AgentBench needs only stable provider identity. OAuth bearer and refresh
    // tokens are not retained after login.
    linkAccount(account) {
      return linkAccount({
        ...account,
        access_token: undefined,
        refresh_token: undefined,
        id_token: undefined,
        session_state: undefined,
      });
    },
  };
}

const githubConfigured = Boolean(
  process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET,
);

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: databaseAdapter(),
  secret: process.env.AUTH_SECRET,
  session: {
    strategy: "database",
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: 24 * 60 * 60,
  },
  providers: githubConfigured
      ? [GitHub({
        clientId: process.env.AUTH_GITHUB_ID,
        clientSecret: process.env.AUTH_GITHUB_SECRET,
        // Linking by email is allowed only after the signIn callback verifies
        // that GitHub currently owns and verifies the exact address.
        allowDangerousEmailAccountLinking: true,
        profile(profile) {
          return {
            id: profile.id.toString(),
            name: profile.name ?? profile.login,
            email: typeof profile.email === "string" ? profile.email.trim().toLowerCase() : null,
            image: profile.avatar_url,
          };
        },
      })]
    : [],
  callbacks: {
    async signIn({ account, profile }) {
      if (!isAuthSignInEnabled()) return false;
      if (account?.provider !== "github") return false;
      if (!account.access_token || typeof profile?.email !== "string") return false;
      return isVerifiedGithubEmail(account.access_token, profile.email);
    },
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.id) throw new Error("Auth.js created a user without an id.");
      if (user.email) {
        await getAuthIdentityRepository().markEmailVerified({
          userId: user.id,
          email: user.email,
        });
      } else {
        await getAuthIdentityRepository().ensureProfile(user.id);
      }
    },
  },
  pages: {
    signIn: "/account",
    error: "/account",
  },
  trustHost: true,
});
