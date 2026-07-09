"use client";

import { useEffect, useState } from "react";
import type { HostedSessionDeadline } from "@/lib/hosted-web";
import {
  fetchHostedSessionSnapshot,
  hostedSessionPollDelay,
} from "@/lib/hosted-session-polling";

type HostedSessionPollingOptions = {
  runId: string | null;
  enabled?: boolean;
  terminal?: boolean;
  refreshKey?: string | number | null;
};

export function useHostedSessionPolling({
  runId,
  enabled = true,
  terminal = false,
  refreshKey = null,
}: HostedSessionPollingOptions) {
  const [sessions, setSessions] = useState<HostedSessionDeadline[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) {
      setSessions([]);
      setError(null);
      return;
    }
    if (!enabled || terminal) {
      return;
    }

    let cancelled = false;
    let timeout: number | null = null;
    let failures = 0;

    const schedule = () => {
      if (cancelled || document.hidden) {
        return;
      }
      timeout = window.setTimeout(() => {
        void refresh();
      }, hostedSessionPollDelay(failures));
    };

    const refresh = async () => {
      if (cancelled || document.hidden) {
        return;
      }

      try {
        const nextSessions = await fetchHostedSessionSnapshot(runId);
        if (cancelled) return;
        failures = 0;
        setSessions(nextSessions);
        setError(null);
      } catch (refreshError) {
        if (cancelled) return;
        failures += 1;
        setError(refreshError instanceof Error ? refreshError.message : "Unable to refresh hosted sessions.");
      } finally {
        schedule();
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (timeout) window.clearTimeout(timeout);
        timeout = null;
        return;
      }
      if (timeout) window.clearTimeout(timeout);
      timeout = null;
      void refresh();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    void refresh();

    return () => {
      cancelled = true;
      if (timeout) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, refreshKey, runId, terminal]);

  return { sessions, error };
}
