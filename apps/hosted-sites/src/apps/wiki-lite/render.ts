import type { ServerResponse } from "node:http";
import type { WikiArticle } from "./types.js";
import type { HostedSessionFor } from "../../runtime/types.js";

type WikiSession = HostedSessionFor<"wiki-lite">;
import { escapeHtml, layout, sendHtml } from "../../templates.js";

export function renderWikiIndex(
  session: WikiSession,
  response: ServerResponse,
  query: string,
  publicBaseUrl: string,
  defaultStartPathForApp: (app: string) => string,
) {
  const normalizedQuery = query.trim().toLowerCase();
  const articles = normalizedQuery
    ? session.state.wikiArticles.filter((article) =>
        `${article.title} ${article.summary} ${article.body}`.toLowerCase().includes(normalizedQuery),
      )
    : session.state.wikiArticles;

  const cards = articles
    .map(
      (article) => `<article class="card">
        <h2>${escapeHtml(article.title)}</h2>
        <p class="muted">${escapeHtml(article.summary)}</p>
        <a href="/wiki/article/${encodeURIComponent(article.slug)}?session=${encodeURIComponent(session.token)}">Open article</a>
      </article>`,
    )
    .join("");

  const submitted = session.state.wikiAnswerSubmissions.at(-1);
  sendHtml(
    response,
    200,
    layout({
      title: "AgentBench Wiki",
      session,
      body: `<section class="panel">
        <form method="get" action="/wiki">
          <input type="hidden" name="session" value="${escapeHtml(session.token)}" />
          <label>
            Search knowledge base
            <input name="q" value="${escapeHtml(query)}" style="display:block;width:100%;min-height:40px;margin-top:8px;border:1px solid #d8d2c7;border-radius:6px;padding:8px 10px;" />
          </label>
          <button type="submit" style="margin-top:12px;">Search</button>
        </form>
      </section>
      <section class="grid" style="margin-top:16px;">${cards}</section>
      <section class="panel" style="margin-top:16px;">
        <h2>Submit answer</h2>
        <p>Submit the exact value requested in the task.</p>
        <form method="post" action="/wiki/answer?session=${encodeURIComponent(session.token)}">
          <input name="answer" placeholder="Enter the exact answer" style="display:block;width:100%;min-height:40px;margin-top:8px;border:1px solid #d8d2c7;border-radius:6px;padding:8px 10px;" />
          <button type="submit" style="margin-top:12px;">Submit answer</button>
        </form>
        ${
          submitted
            ? `<p style="margin-top:12px;">Latest submission: <strong>${escapeHtml(submitted.answer)}</strong></p>`
            : ""
        }
      </section>`,
      publicBaseUrl,
      defaultStartPathForApp,
    }),
  );
}

export function renderWikiArticle(
  session: WikiSession,
  article: WikiArticle,
  response: ServerResponse,
  publicBaseUrl: string,
  defaultStartPathForApp: (app: string) => string,
) {
  sendHtml(
    response,
    200,
    layout({
      title: article.title,
      session,
      body: `<section class="panel">
        <p class="muted">${escapeHtml(article.summary)}</p>
        <p>${escapeHtml(article.body)}</p>
      </section>
      <section class="panel" style="margin-top:16px;">
        <h2>Submit answer</h2>
        <form method="post" action="/wiki/answer?session=${encodeURIComponent(session.token)}">
          <input name="answer" placeholder="Enter the exact answer" style="display:block;width:100%;min-height:40px;margin-top:8px;border:1px solid #d8d2c7;border-radius:6px;padding:8px 10px;" />
          <button type="submit" style="margin-top:12px;">Submit answer</button>
        </form>
      </section>`,
      publicBaseUrl,
      defaultStartPathForApp,
    }),
  );
}
