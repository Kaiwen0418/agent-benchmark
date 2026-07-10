type HostedViewerEvent = {
  type: string;
  payload: Record<string, unknown>;
};

function sessionIdFromEvent(event: HostedViewerEvent) {
  return typeof event.payload.sessionId === "string" ? event.payload.sessionId : null;
}

function routeRoot(pathname: string) {
  return pathname.split("/").filter(Boolean)[0] ?? "";
}

function applyNavigation(viewerStartUrl: string, navigationUrl: string) {
  try {
    const viewer = new URL(viewerStartUrl);
    const navigation = new URL(navigationUrl, viewer.origin);
    const viewerRoot = routeRoot(viewer.pathname);
    if (!viewerRoot || routeRoot(navigation.pathname) !== viewerRoot) {
      return viewerStartUrl;
    }

    const viewerToken = viewer.searchParams.get("session");
    viewer.pathname = navigation.pathname;
    viewer.search = navigation.search;
    if (viewerToken) {
      viewer.searchParams.set("session", viewerToken);
    }
    viewer.hash = "";
    return viewer.toString();
  } catch {
    return viewerStartUrl;
  }
}

export function deriveHostedViewerUrl(events: HostedViewerEvent[]) {
  const sessions = new Map<string, { url: string; sequenceIndex: number }>();
  let activeSessionId: string | null = null;
  let activeUrl: string | null = null;

  for (const event of events) {
    const sessionId = sessionIdFromEvent(event);
    if (!sessionId) continue;

    if (event.type === "hosted.session.created" && typeof event.payload.viewerStartUrl === "string") {
      const sequenceIndex =
        typeof event.payload.sequenceIndex === "number" && Number.isFinite(event.payload.sequenceIndex)
          ? event.payload.sequenceIndex
          : sessions.size;
      sessions.set(sessionId, { url: event.payload.viewerStartUrl, sequenceIndex });
      if (activeSessionId === null || sequenceIndex < (sessions.get(activeSessionId)?.sequenceIndex ?? Infinity)) {
        activeSessionId = sessionId;
        activeUrl = event.payload.viewerStartUrl;
      }
      continue;
    }

    if (event.type === "hosted.page.load" && typeof event.payload.url === "string") {
      const viewerSession = sessions.get(sessionId);
      if (!viewerSession) continue;
      activeSessionId = sessionId;
      activeUrl = applyNavigation(viewerSession.url, event.payload.url);
    }
  }

  return activeUrl;
}

export function deriveActiveHostedViewerUrl(events: HostedViewerEvent[], activeSessionId: string | null) {
  if (!activeSessionId) {
    return deriveHostedViewerUrl(events);
  }

  const sessions = new Map<string, { url: string; sequenceIndex: number }>();
  let activeUrl: string | null = null;

  for (const event of events) {
    const sessionId = sessionIdFromEvent(event);
    if (sessionId !== activeSessionId) continue;

    if (event.type === "hosted.session.created" && typeof event.payload.viewerStartUrl === "string") {
      sessions.set(sessionId, {
        url: event.payload.viewerStartUrl,
        sequenceIndex:
          typeof event.payload.sequenceIndex === "number" && Number.isFinite(event.payload.sequenceIndex)
            ? event.payload.sequenceIndex
            : sessions.size,
      });
      continue;
    }

    if (event.type === "hosted.page.load" && typeof event.payload.url === "string") {
      const viewerSession = sessions.get(sessionId);
      if (!viewerSession) continue;
      activeUrl = applyNavigation(viewerSession.url, event.payload.url);
    }
  }

  return activeUrl ?? sessions.get(activeSessionId)?.url ?? deriveHostedViewerUrl(events);
}

export function deriveHostedViewerRevision(events: HostedViewerEvent[]) {
  return events.filter(
    (event) =>
      event.type === "hosted.page.load" ||
      event.type === "hosted.session.progress" ||
      event.type === "hosted.task_signal" ||
      event.type === "hosted.score",
  ).length;
}

export function deriveActiveHostedSessionId(events: HostedViewerEvent[]) {
  // The persisted progress projection is emitted before the score event and
  // remains correct when a scorer event is delayed or absent from a replay.
  const latestProgress = [...events]
    .reverse()
    .find((event) => event.type === "hosted.session.progress");
  if (typeof latestProgress?.payload.activeSessionId === "string") {
    return latestProgress.payload.activeSessionId;
  }

  const sessions = new Map<string, { sequenceIndex: number }>();

  for (const event of events) {
    if (event.type !== "hosted.session.created") continue;

    const sessionId = sessionIdFromEvent(event);
    if (!sessionId) continue;

    const sequenceIndex =
      typeof event.payload.sequenceIndex === "number" && Number.isFinite(event.payload.sequenceIndex)
        ? event.payload.sequenceIndex
        : sessions.size;

    sessions.set(sessionId, { sequenceIndex });
  }

  const scoredSessionIds = new Set<string>();
  for (const event of events) {
    if (event.type !== "hosted.score") continue;

    const sessionId = sessionIdFromEvent(event);
    if (sessionId) {
      scoredSessionIds.add(sessionId);
    }
  }

  const activeEntry = [...sessions.entries()]
    .filter(([sessionId]) => !scoredSessionIds.has(sessionId))
    .sort((left, right) => left[1].sequenceIndex - right[1].sequenceIndex)[0];

  return activeEntry?.[0] ?? null;
}
