import type { ServerResponse } from "node:http";
import type { RepoFile, RepoMergeRequest } from "./types.js";
import type { HostedSessionFor } from "../../runtime/types.js";
import { shouldRenderScorePreview } from "../../runtime/score-preview-policy.js";
import { readTaskConfig } from "../../runtime/question-config.js";
import { computeCiStatuses, readCiChecks } from "./workflow.js";

type RepoSession = HostedSessionFor<"repo-lite">;
import { escapeHtml, layout, sendHtml } from "../../templates.js";

// Simulated CI status panel for hard variants. Renders one row per configured
// check with a pass/fail marker and the files still needing the consistency
// token. The token itself (the canonical answer) is never printed.
function renderCiPanel(session: RepoSession): string {
  let checks;
  try {
    checks = readCiChecks(readTaskConfig(session.metadata));
  } catch {
    return "";
  }
  if (checks.length === 0) return "";
  const statuses = computeCiStatuses(session.state.files, checks);
  const rows = statuses
    .map((status) => {
      const marker = status.passed
        ? '<span style="color:#1a7f37;">✓ passing</span>'
        : '<span style="color:#cf222e;">✗ failing</span>';
      const detail =
        !status.passed && status.missingFiles.length
          ? `<span class="muted"> — needs updates in ${escapeHtml(status.missingFiles.join(", "))}</span>`
          : "";
      return `<li>${marker} ${escapeHtml(status.name)}${detail}</li>`;
    })
    .join("");
  return `<section class="panel" style="margin-top:16px;">
        <h2>CI checks</h2>
        <ul>${rows}</ul>
      </section>`;
}

export function renderRepoIndex(
  session: RepoSession,
  response: ServerResponse,
  publicBaseUrl: string,
  defaultStartPathForApp: (app: string) => string,
) {
  const readmeFile = session.state.files.find((f) => f.path === "README.md");
  const fileList = session.state.files
    .map(
      (file) => `<li>
        <a href="/repo/file/${encodeURIComponent(file.path)}/edit?session=${encodeURIComponent(session.token)}">${escapeHtml(file.path)}</a>
      </li>`,
    )
    .join("");

  const mrList = session.state.mergeRequests
    .map(
      (mr) => `<li>
        <a href="/repo/mr/${encodeURIComponent(mr.id)}?session=${encodeURIComponent(session.token)}">${escapeHtml(mr.title)}</a>
        <span class="muted">→ ${escapeHtml(mr.targetBranch)}</span>
      </li>`,
    )
    .join("");

  const readmePreview = readmeFile
    ? `<pre style="background:#fff;border:1px solid var(--line);border-radius:6px;padding:12px;overflow:auto;">${escapeHtml(readmeFile.content)}</pre>`
    : "";

  sendHtml(
    response,
    200,
    layout({
      title: "Demo Project",
      session,
      body: `<section class="panel">
        <h2>Files</h2>
        <ul>${fileList}</ul>
      </section>
      <section class="panel" style="margin-top:16px;">
        <h2>README.md</h2>
        ${readmePreview}
        <a href="/repo/file/README.md/edit?session=${encodeURIComponent(session.token)}">
          <button style="margin-top:12px;">Edit README.md</button>
        </a>
      </section>
      ${renderCiPanel(session)}
      <section class="panel" style="margin-top:16px;">
        <h2>Merge Requests</h2>
        ${mrList.length ? `<ul>${mrList}</ul>` : '<p class="muted">No merge requests yet.</p>'}
        <a href="/repo/mr/new?session=${encodeURIComponent(session.token)}">
          <button style="margin-top:12px;">New merge request</button>
        </a>
      </section>`,
      publicBaseUrl,
      defaultStartPathForApp,
    }),
  );
}

export function renderFileEdit(
  session: RepoSession,
  file: RepoFile,
  response: ServerResponse,
  publicBaseUrl: string,
  defaultStartPathForApp: (app: string) => string,
) {
  sendHtml(
    response,
    200,
    layout({
      title: `Edit ${file.path}`,
      session,
      body: `<section class="panel">
        <h2>Edit ${escapeHtml(file.path)}</h2>
        <form method="post" action="/repo/file/${encodeURIComponent(file.path)}/edit?session=${encodeURIComponent(session.token)}">
          <label>
            Content
            <textarea name="content" rows="12" style="display:block;width:100%;margin-top:8px;border:1px solid #d8d2c7;border-radius:6px;padding:8px 10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;">${escapeHtml(file.content)}</textarea>
          </label>
          <button type="submit" style="margin-top:12px;">Save changes</button>
        </form>
      </section>`,
      publicBaseUrl,
      defaultStartPathForApp,
    }),
  );
}

export function renderNewMR(
  session: RepoSession,
  response: ServerResponse,
  publicBaseUrl: string,
  defaultStartPathForApp: (app: string) => string,
) {
  const readmeFile = session.state.files.find((f) => f.path === "README.md");
  const diffPreview = readmeFile
    ? `<pre style="background:#fff;border:1px solid var(--line);border-radius:6px;padding:12px;overflow:auto;">${escapeHtml(readmeFile.content)}</pre>`
    : '<p class="muted">README.md not found.</p>';

  sendHtml(
    response,
    200,
    layout({
      title: "New Merge Request",
      session,
      body: `<section class="panel">
        <h2>New Merge Request</h2>
        <p class="muted">Proposed changes</p>
        ${diffPreview}
        <form method="post" action="/repo/mr/new?session=${encodeURIComponent(session.token)}" style="margin-top:16px;">
          <label>
            Title
            <input name="title" placeholder="Enter the required merge request title" style="display:block;width:100%;min-height:40px;margin-top:8px;border:1px solid #d8d2c7;border-radius:6px;padding:8px 10px;" />
          </label>
          <label style="display:block;margin-top:12px;">
            Target branch
            <input name="targetBranch" placeholder="Enter the required target branch" style="display:block;width:100%;min-height:40px;margin-top:8px;border:1px solid #d8d2c7;border-radius:6px;padding:8px 10px;" />
          </label>
          <label style="display:block;margin-top:12px;">Source branch
            <input name="sourceBranch" placeholder="Optional feature branch" />
          </label>
          <label style="display:block;margin-top:12px;">Commit message
            <input name="commitMessage" placeholder="Optional required commit message" />
          </label>
          <label style="display:block;margin-top:12px;">Reviewer
            <input name="reviewer" placeholder="Optional reviewer username" />
          </label>
          <label style="display:block;margin-top:12px;">
            <input type="checkbox" name="conflictResolved" value="yes" />
            Simulated target-branch conflict resolved
          </label>
          <button type="submit" style="margin-top:12px;">Create merge request</button>
        </form>
      </section>`,
      publicBaseUrl,
      defaultStartPathForApp,
    }),
  );
}

export function renderMRDetail(
  session: RepoSession,
  mr: RepoMergeRequest,
  response: ServerResponse,
  publicBaseUrl: string,
  defaultStartPathForApp: (app: string) => string,
  score: { status: string; score: number; summary: string },
) {
  const changedFilesHtml = mr.changedFiles
    .map(
      (file) => `<div style="margin-top:12px;">
        <p><strong>${escapeHtml(file.path)}</strong></p>
        <pre style="background:#fff;border:1px solid var(--line);border-radius:6px;padding:12px;overflow:auto;">${escapeHtml(file.content)}</pre>
      </div>`,
    )
    .join("");

  const scorePreview = shouldRenderScorePreview(session)
    ? `<h3 style="margin-top:16px;">Evaluator preview</h3>
        <pre class="score">${escapeHtml(JSON.stringify(score, null, 2))}</pre>`
    : "";

  sendHtml(
    response,
    200,
    layout({
      title: mr.title,
      session,
      body: `<section class="panel">
        <h2>${escapeHtml(mr.title)}</h2>
        <p class="muted">Target branch: <strong>${escapeHtml(mr.targetBranch)}</strong></p>
        ${mr.sourceBranch ? `<p class="muted">Source branch: <strong>${escapeHtml(mr.sourceBranch)}</strong></p>` : ""}
        ${mr.commitMessage ? `<p class="muted">Commit: <strong>${escapeHtml(mr.commitMessage)}</strong></p>` : ""}
        ${mr.reviewer ? `<p class="muted">Reviewer: <strong>${escapeHtml(mr.reviewer)}</strong></p>` : ""}
        <h3>Changed files</h3>
        ${changedFilesHtml}
        ${scorePreview}
      </section>`,
      publicBaseUrl,
      defaultStartPathForApp,
    }),
  );
}
