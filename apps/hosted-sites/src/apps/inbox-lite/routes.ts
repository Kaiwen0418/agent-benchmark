import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostedAppRouteDeps } from "../../runtime/app-definition.js";
import { redirect, sendJson } from "../../runtime/http.js";
import { readTaskConfig } from "../../runtime/question-config.js";
import { isHostedSessionForApp } from "../../runtime/types.js";
import { recheckInboxPolicy, saveInboxDraft, sendInboxDraft, updateInboxDraft } from "./actions.js";
import { readInboxPolicyAmendment } from "./policy-amendment.js";
import { renderInboxCompose, renderInboxIndex, renderInboxThread } from "./render.js";

export function createInboxLiteRoutes(deps: HostedAppRouteDeps) {
  async function getSession(url: URL, request: IncomingMessage) {
    const session = await deps.getSession(url, request);
    return session && isHostedSessionForApp(session, "inbox-lite") ? session : null;
  }

  async function completeSentDraft(
    session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
    response: ServerResponse,
    draftId: string,
  ) {
    const config = readTaskConfig(session.metadata);
    const amendment = readInboxPolicyAmendment(config);
    const draft = session.state.inboxDrafts.find((candidate) => candidate.id === draftId);
    if (amendment) {
      const expectedRecipients = Array.isArray(config.expectedRecipients)
        ? config.expectedRecipients.filter((recipient): recipient is string => typeof recipient === "string").map((recipient) => recipient.toLowerCase()).sort()
        : [];
      const expectedSubject = typeof config.expectedSubject === "string" ? config.expectedSubject : null;
      const amendmentCheck = session.state.inboxPolicyChecks.find((check) => check.status === "updated");
      const revisedInPlace = draft
        && amendmentCheck?.draftId === draft.id
        && draft.revisionCount > amendmentCheck.baselineRevisionCount
        && draft.subject === expectedSubject
        && JSON.stringify([...draft.recipients].sort()) === JSON.stringify(expectedRecipients);
      if (!revisedInPlace) {
        deps.badRequest(response, "Observe the amendment and update the tracked draft before sending.");
        return;
      }
    }
    const sent = sendInboxDraft(session, { draftId, now: deps.now });
    if (!sent.success) {
      deps.badRequest(response, sent.error);
      return;
    }
    await deps.persistSessionSnapshot(session);
    await deps.recordEvent(session, {
      type: "task.signal",
      name: "inbox.message_sent",
      messageId: sent.sentMessage.id,
    });
    const completed = await deps.completeSession(session, deps.evaluateSession(session));
    if (!completed) {
      sendJson(response, 502, { error: "Hosted orchestrator unavailable" });
      return;
    }
    redirect(response, `/inbox?session=${encodeURIComponent(session.token)}`);
  }

  async function parseAndSaveDraft(
    request: IncomingMessage,
    session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
  ) {
    const form = await deps.readForm(request);
    const threadId = form.get("threadId");
    const recipients = form.get("recipients");
    const subject = form.get("subject");
    const body = form.get("body");
    if ([threadId, recipients, subject, body].some((value) => typeof value !== "string")) {
      return { success: false, error: "Thread, recipients, subject, and body are required" } as const;
    }
    return saveInboxDraft(session, {
      threadId: threadId as string,
      recipients: (recipients as string).split(","),
      subject: subject as string,
      body: body as string,
      makeId: deps.makeId,
      now: deps.now,
    });
  }

  async function handle(request: IncomingMessage, response: ServerResponse, url: URL) {
    const inboxPath = url.pathname === "/inbox"
      || url.pathname === "/inbox/compose"
      || url.pathname === "/inbox/drafts"
      || url.pathname === "/inbox/send"
      || url.pathname === "/inbox/policy/recheck"
      || url.pathname.startsWith("/inbox/thread/")
      || url.pathname.startsWith("/inbox/drafts/");
    if (!inboxPath) return false;
    const session = await getSession(url, request);
    if (!session) {
      deps.badRequest(response, "Missing or invalid session");
      return true;
    }

    if (request.method === "GET" && url.pathname === "/inbox") {
      renderInboxIndex(session, response, deps.publicBaseUrl, deps.defaultStartPathForApp);
      return true;
    }
    if (request.method === "POST" && url.pathname === "/inbox/policy/recheck") {
      if (deps.rejectTerminalMutation(session, response)) return true;
      const checked = recheckInboxPolicy(
        session,
        readTaskConfig(session.metadata),
        { makeId: deps.makeId, now: deps.now },
      );
      if (!checked.success) {
        deps.badRequest(response, checked.error);
        return true;
      }
      await deps.persistSessionSnapshot(session);
      await deps.recordEvent(session, {
        type: "task.signal",
        name: "inbox.policy_rechecked",
        checkNumber: checked.check.checkNumber,
        status: checked.check.status,
      });
      redirect(response, `/inbox?session=${encodeURIComponent(session.token)}`);
      return true;
    }
    const threadMatch = url.pathname.match(/^\/inbox\/thread\/([^/]+)$/);
    if (request.method === "GET" && threadMatch) {
      const thread = session.state.inboxThreads.find(
        (candidate) => candidate.id === decodeURIComponent(threadMatch[1]!),
      );
      if (!thread) deps.notFound(response);
      else renderInboxThread(session, thread, response, deps.publicBaseUrl, deps.defaultStartPathForApp);
      return true;
    }
    if (request.method === "GET" && url.pathname === "/inbox/compose") {
      renderInboxCompose(
        session,
        url.searchParams.get("thread"),
        response,
        deps.publicBaseUrl,
        deps.defaultStartPathForApp,
      );
      return true;
    }
    if (request.method === "POST" && (url.pathname === "/inbox/drafts" || url.pathname === "/inbox/send")) {
      if (deps.rejectTerminalMutation(session, response)) return true;
      const saved = await parseAndSaveDraft(request, session);
      if (!saved.success) {
        await deps.persistSessionSnapshot(session);
        deps.badRequest(response, saved.error);
        return true;
      }
      await deps.persistSessionSnapshot(session);
      if (url.pathname === "/inbox/send") {
        await completeSentDraft(session, response, saved.draft.id);
      } else {
        redirect(response, `/inbox/compose?thread=${encodeURIComponent(saved.draft.threadId)}&session=${encodeURIComponent(session.token)}`);
      }
      return true;
    }
    const sendDraftMatch = url.pathname.match(/^\/inbox\/drafts\/([^/]+)\/send$/);
    if (request.method === "POST" && sendDraftMatch) {
      if (deps.rejectTerminalMutation(session, response)) return true;
      await completeSentDraft(session, response, decodeURIComponent(sendDraftMatch[1]!));
      return true;
    }
    const updateDraftMatch = url.pathname.match(/^\/inbox\/drafts\/([^/]+)$/);
    if (request.method === "POST" && updateDraftMatch) {
      if (deps.rejectTerminalMutation(session, response)) return true;
      const form = await deps.readForm(request);
      const recipients = form.get("recipients");
      const subject = form.get("subject");
      const body = form.get("body");
      if (typeof recipients !== "string" || typeof subject !== "string" || typeof body !== "string") {
        deps.badRequest(response, "Recipients, subject, and body are required");
        return true;
      }
      const updated = updateInboxDraft(session, {
        draftId: decodeURIComponent(updateDraftMatch[1]!),
        recipients: recipients.split(","),
        subject,
        body,
        makeId: deps.makeId,
        now: deps.now,
      });
      if (!updated.success) {
        await deps.persistSessionSnapshot(session);
        deps.badRequest(response, updated.error);
        return true;
      }
      await deps.persistSessionSnapshot(session);
      await deps.recordEvent(session, {
        type: "task.signal",
        name: "inbox.draft_revised",
        draftId: updated.draft.id,
        revisionCount: updated.draft.revisionCount,
      });
      redirect(response, `/inbox/compose?thread=${encodeURIComponent(updated.draft.threadId)}&session=${encodeURIComponent(session.token)}`);
      return true;
    }
    return false;
  }

  return { handle };
}
