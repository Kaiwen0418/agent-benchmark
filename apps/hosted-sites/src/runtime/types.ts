import type { HostedAttemptSessionStatus } from "@agentbench/shared";
import type { CartItem, Order, Product } from "../apps/shopping-lite/types.js";
import type { ForumThread, ModerationAction } from "../apps/forum-lite/types.js";
import type { RepoFile, RepoIssue, RepoMergeRequest } from "../apps/repo-lite/types.js";
import type { WikiAnswerSubmission, WikiArticle } from "../apps/wiki-lite/types.js";

export type HostedSessionStatus = HostedAttemptSessionStatus;

export type HostedAppId = "shopping-lite" | "wiki-lite" | "forum-lite" | "repo-lite";

export type ShoppingAppSessionState = {
  products: Product[];
  cart: CartItem[];
  orders: Order[];
};

export type WikiAppSessionState = {
  wikiArticles: WikiArticle[];
  wikiAnswerSubmissions: WikiAnswerSubmission[];
};

export type ForumAppSessionState = {
  threads: ForumThread[];
  moderationActions: ModerationAction[];
};

export type RepoAppSessionState = {
  files: RepoFile[];
  issues: RepoIssue[];
  mergeRequests: RepoMergeRequest[];
};

export type HostedAppStateById = {
  "shopping-lite": ShoppingAppSessionState;
  "wiki-lite": WikiAppSessionState;
  "forum-lite": ForumAppSessionState;
  "repo-lite": RepoAppSessionState;
};

export type HostedAppSessionState = HostedAppStateById[HostedAppId];
export type HostedAppPersistenceState = Partial<ShoppingAppSessionState> &
  Partial<WikiAppSessionState> &
  Partial<ForumAppSessionState> &
  Partial<RepoAppSessionState>;

type HostedSessionBase = {
  id: string;
  token: string;
  accessMode?: "write" | "viewer";
  runId: string | null;
  caseId: string | null;
  attemptId: string | null;
  callbackSecret: string | null;
  suiteSlug: string;
  suiteVersion: string;
  taskSlug: string;
  taskVersion: string;
  sequenceIndex: number;
  weight: number;
  required: boolean;
  title: string | null;
  goal: string;
  startPath: string | null;
  seedVersion: string;
  metadata: Record<string, unknown>;
  status: HostedSessionStatus;
  expiresAt: string | null;
  accessCount: number;
  lastAccessedAt: string | null;
  firstSeenIp: string | null;
  lastSeenIp: string | null;
  firstSeenUserAgent: string | null;
  lastSeenUserAgent: string | null;
  createdAt: string;
  events: Array<Record<string, unknown>>;
  persisted: boolean;
};

export type HostedSessionFor<TApp extends HostedAppId> = TApp extends HostedAppId
  ? HostedSessionBase & {
      app: TApp;
      state: HostedAppStateById[TApp];
    }
  : never;

export type HostedSession = {
  [TApp in HostedAppId]: HostedSessionFor<TApp>;
}[HostedAppId];

export function isHostedSessionForApp<TApp extends HostedAppId>(
  session: HostedSession,
  app: TApp,
): session is Extract<HostedSession, { app: TApp }> {
  return session.app === app;
}

export type HostedAttemptOverviewSession = {
  id: string;
  token: string;
  app: string;
  taskSlug: string;
  title: string | null;
  goal: string;
  startPath: string | null;
  sequenceIndex: number;
  status: HostedSessionStatus;
};
