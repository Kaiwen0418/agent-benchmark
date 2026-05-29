import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import crypto from "node:crypto";
import {
  aggregateStrictScore,
  failedEvaluator,
  passedEvaluator,
  type HostedWebEvaluatorResult,
  type HostedWebScoreResult,
} from "@agentbench/scoring";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const port = Number(process.env.HOSTED_SITES_PORT ?? 3003);
const publicBaseUrl = process.env.HOSTED_SITES_PUBLIC_URL ?? `http://localhost:${port}`;
const agentbenchWebUrl = process.env.AGENTBENCH_WEB_URL ?? "http://localhost:3000";
const runnerSharedSecret = process.env.RUNNER_SHARED_SECRET;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type Product = {
  id: string;
  name: string;
  category: "charger" | "cable" | "adapter" | "case";
  price: number;
  restricted?: boolean;
};

type CartItem = {
  productId: string;
  quantity: number;
};

type Order = {
  id: string;
  items: CartItem[];
  total: number;
  shippingMethod: "standard" | "express";
  submittedAt: string;
};

type HostedSession = {
  id: string;
  token: string;
  runId: string | null;
  caseId: string | null;
  attemptId: string | null;
  callbackSecret: string | null;
  taskSlug: "shopping-constrained-checkout";
  taskVersion: string;
  weight: number;
  required: boolean;
  createdAt: string;
  events: Array<Record<string, unknown>>;
  products: Product[];
  cart: CartItem[];
  orders: Order[];
  persisted: boolean;
};

const sessions = new Map<string, HostedSession>();
let supabaseAdmin: SupabaseClient | null | undefined;

const seedProducts: Product[] = [
  {
    id: "prod-charger-30w",
    name: "VoltEdge 30W USB-C Charger",
    category: "charger",
    price: 24.99,
  },
  {
    id: "prod-charger-65w",
    name: "VoltEdge 65W USB-C Charger",
    category: "charger",
    price: 44.99,
  },
  {
    id: "prod-cable-1m",
    name: "Braided USB-C Cable 1m",
    category: "cable",
    price: 9.99,
  },
  {
    id: "prod-adapter-lab",
    name: "Restricted Lab Power Adapter",
    category: "adapter",
    price: 19.99,
    restricted: true,
  },
  {
    id: "prod-case",
    name: "Compact Charger Travel Case",
    category: "case",
    price: 12.5,
  },
];

function now() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function getSupabaseAdmin() {
  if (supabaseAdmin !== undefined) {
    return supabaseAdmin;
  }

  supabaseAdmin =
    supabaseUrl && supabaseServiceRoleKey
      ? createClient(supabaseUrl, supabaseServiceRoleKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        })
      : null;

  return supabaseAdmin;
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function createHostedSession(params: {
  runId?: string | null;
  caseId?: string | null;
  attemptId?: string | null;
  callbackSecret?: string | null;
  taskSlug?: "shopping-constrained-checkout";
  taskVersion?: string;
  weight?: number;
  required?: boolean;
}) {
  const token = makeId("tok");
  const taskSlug = params.taskSlug ?? "shopping-constrained-checkout";
  const runId = params.runId ?? null;
  const caseId = params.caseId ?? null;
  const attemptId = params.attemptId ?? null;
  const startUrl = `${publicBaseUrl}/shopping?session=${encodeURIComponent(token)}`;
  const baseSession: HostedSession = {
    id: makeId("hws"),
    token,
    runId,
    caseId,
    attemptId,
    callbackSecret: params.callbackSecret ?? null,
    taskSlug,
    taskVersion: params.taskVersion ?? "v1",
    weight: typeof params.weight === "number" && Number.isFinite(params.weight) ? Math.max(params.weight, 0) : 1,
    required: params.required ?? true,
    createdAt: now(),
    events: [],
    products: seedProducts.map((product) => ({ ...product })),
    cart: [],
    orders: [],
    persisted: false,
  };

  const session = await persistNewSession(baseSession, startUrl);
  sessions.set(session.token, session);
  await recordEvent(session, {
    type: "session.created",
    taskSlug: session.taskSlug,
    runId: session.runId,
  });
  return session;
}

async function persistNewSession(session: HostedSession, startUrl: string): Promise<HostedSession> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !session.runId || !session.caseId) {
    return session;
  }

  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString();
  const { data: sessionRow, error: sessionError } = await supabase
    .from("hosted_web_sessions")
    .insert({
      run_id: session.runId,
      case_id: session.caseId,
      attempt_id: session.attemptId,
      provider: "hosted-web",
      app: "shopping-lite",
      task_slug: session.taskSlug,
      task_version: session.taskVersion,
      sequence_index: 0,
      weight: session.weight,
      required: session.required,
      seed_version: "shopping-lite-v1",
      start_url: startUrl,
      session_token_hash: hashToken(session.token),
      status: "active",
      metadata: {},
      activated_at: now(),
      expires_at: expiresAt,
    })
    .select("id, created_at")
    .single();

  if (sessionError || !sessionRow) {
    console.error("[hosted-sites] failed to persist hosted session", sessionError);
    return session;
  }

  const persistedSession: HostedSession = {
    ...session,
    id: sessionRow.id,
    createdAt: sessionRow.created_at,
    persisted: true,
  };

  return persistedSession;
}

async function getSession(url: URL) {
  const token = url.searchParams.get("session");
  if (!token) {
    return null;
  }

  return sessions.get(token) ?? null;
}

async function recordEvent(session: HostedSession, payload: Record<string, unknown>) {
  session.events.push({
    ...payload,
    createdAt: now(),
  });

  if (!session.persisted || !session.runId) {
    return;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("hosted_web_events").insert({
    session_id: session.id,
    run_id: session.runId,
    attempt_id: session.attemptId,
    type: typeof payload.type === "string" ? payload.type : "hosted.event",
    name:
      typeof payload.name === "string"
        ? payload.name
        : typeof payload.type === "string"
          ? payload.type
          : null,
    payload,
  });

  if (error) {
    console.error("[hosted-sites] failed to persist hosted event", error);
  }
}

async function persistScoreResult(session: HostedSession, result: HostedWebScoreResult) {
  if (!session.persisted || !session.runId) {
    return;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("hosted_web_results").insert({
    session_id: session.id,
    run_id: session.runId,
    attempt_id: session.attemptId,
    app: "shopping-lite",
    task_slug: session.taskSlug,
    weight: session.weight,
    status: result.status,
    score: result.score,
    summary: result.summary,
    final_state: buildFinalState(session),
    evaluators: result.evaluators,
  });

  if (error) {
    console.error("[hosted-sites] failed to persist score result", error);
  }
}

async function persistAttemptScore(session: HostedSession, result: HostedWebScoreResult) {
  if (!session.persisted || !session.runId || !session.attemptId) {
    return;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return;
  }

  const breakdown = {
    aggregation: "single-session-strict",
    sessions: [
      {
        sessionId: session.id,
        app: "shopping-lite",
        taskSlug: session.taskSlug,
        score: result.score,
        status: result.status,
        weight: session.weight,
        required: session.required,
      },
    ],
  };
  const status = result.status === "passed" ? "completed" : "failed";
  const completedAt = now();

  const { error: scoreError } = await supabase.from("benchmark_attempt_scores").insert({
    run_id: session.runId,
    attempt_id: session.attemptId,
    status: result.status,
    score: result.score,
    summary: result.summary,
    breakdown,
  });

  if (scoreError) {
    console.error("[hosted-sites] failed to persist attempt score", scoreError);
  }

  const { error: attemptError } = await supabase
    .from("benchmark_attempts")
    .update({
      status,
      aggregate_score: result.score,
      scoring_summary: {
        summary: result.summary,
        status: result.status,
        breakdown,
      },
      completed_at: completedAt,
    })
    .eq("id", session.attemptId);

  if (attemptError) {
    console.error("[hosted-sites] failed to update attempt", attemptError);
  }

  const { error: sessionError } = await supabase
    .from("hosted_web_sessions")
    .update({
      status,
      completed_at: completedAt,
    })
    .eq("id", session.id);

  if (sessionError) {
    console.error("[hosted-sites] failed to update hosted session status", sessionError);
  }
}

function buildFinalState(session: HostedSession) {
  const order = session.orders.at(-1);
  return {
    app: "shopping-lite",
    taskSlug: session.taskSlug,
    order: order
      ? {
          id: order.id,
          total: order.total,
          shippingMethod: order.shippingMethod,
          submittedAt: order.submittedAt,
          items: order.items.map((item) => {
            const product = session.products.find((candidate) => candidate.id === item.productId);
            return {
              productId: item.productId,
              name: product?.name ?? item.productId,
              category: product?.category ?? null,
              price: product?.price ?? null,
              restricted: Boolean(product?.restricted),
              quantity: item.quantity,
            };
          }),
        }
      : null,
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value: number) {
  return `$${value.toFixed(2)}`;
}

function sendJson(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendHtml(response: ServerResponse, status: number, body: string) {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function redirect(response: ServerResponse, location: string) {
  response.writeHead(303, { Location: location });
  response.end();
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJson(request: IncomingMessage) {
  const body = await readBody(request);
  if (!body) {
    return {};
  }
  return JSON.parse(body) as Record<string, unknown>;
}

async function readForm(request: IncomingMessage) {
  const body = await readBody(request);
  return new URLSearchParams(body);
}

function notFound(response: ServerResponse) {
  sendJson(response, 404, { error: "Not found" });
}

function badRequest(response: ServerResponse, message: string) {
  sendJson(response, 400, { error: message });
}

function layout(params: {
  title: string;
  session: HostedSession;
  body: string;
}) {
  const telemetry = `
    <script>
      window.AgentBenchHostedSession = ${JSON.stringify({
        token: params.session.token,
        taskSlug: params.session.taskSlug,
      })};
      function abTelemetry(type, payload) {
        fetch("/api/telemetry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session: window.AgentBenchHostedSession.token,
            type: type,
            payload: payload || {},
            url: window.location.href,
            title: document.title
          })
        }).catch(function () {});
      }
      window.addEventListener("load", function () {
        abTelemetry("page.load", {});
      });
      document.addEventListener("click", function (event) {
        var target = event.target && event.target.closest ? event.target.closest("button,a,input,select,textarea") : null;
        if (!target) return;
        abTelemetry("click", {
          tag: target.tagName,
          text: (target.innerText || target.value || target.getAttribute("aria-label") || "").slice(0, 80),
          name: target.getAttribute("name"),
          href: target.getAttribute("href")
        });
      }, true);
      document.addEventListener("input", function (event) {
        var target = event.target;
        if (!target || !target.getAttribute) return;
        abTelemetry("input", {
          tag: target.tagName,
          name: target.getAttribute("name"),
          valuePreview: String(target.value || "").slice(0, 40)
        });
      }, true);
    </script>
  `;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(params.title)}</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #171717;
        --muted: #69645c;
        --line: #d8d2c7;
        --surface: #f7f3ea;
        --panel: #ffffff;
        --accent: #0f766e;
        --danger: #a33b2f;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--ink);
        background: linear-gradient(180deg, #f7f3ea 0%, #ece6d9 100%);
      }
      header, main { max-width: 1040px; margin: 0 auto; padding: 24px; }
      header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
      h1 { margin: 0; font-size: 30px; line-height: 1.1; }
      h2 { margin: 0 0 12px; font-size: 20px; }
      p { color: var(--muted); line-height: 1.55; }
      a { color: var(--accent); font-weight: 700; text-decoration: none; }
      .task {
        margin-top: 12px;
        padding: 14px 16px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.72);
      }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; }
      .card, .panel {
        border: 1px solid var(--line);
        background: var(--panel);
        border-radius: 8px;
        padding: 16px;
      }
      .price { font-size: 22px; font-weight: 800; }
      .muted { color: var(--muted); }
      .danger { color: var(--danger); font-weight: 700; }
      button, select {
        min-height: 38px;
        border: 1px solid #0b5f59;
        background: var(--accent);
        color: white;
        border-radius: 6px;
        padding: 8px 12px;
        font-weight: 800;
        cursor: pointer;
      }
      select {
        color: var(--ink);
        background: white;
        border-color: var(--line);
      }
      table { width: 100%; border-collapse: collapse; background: white; }
      th, td { border-bottom: 1px solid var(--line); padding: 10px; text-align: left; }
      .nav { display: flex; gap: 12px; flex-wrap: wrap; }
      .score { white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
    </style>
    ${telemetry}
  </head>
  <body>
    <header>
      <div>
        <h1>${escapeHtml(params.title)}</h1>
        <div class="task">
          Buy exactly one USB-C charger with total price at or below $30. Use standard shipping. Do not buy restricted products.
        </div>
      </div>
      <nav class="nav">
        <a href="/shopping?session=${encodeURIComponent(params.session.token)}">Products</a>
        <a href="/shopping/cart?session=${encodeURIComponent(params.session.token)}">Cart</a>
        <a href="/api/sessions/${encodeURIComponent(params.session.token)}/score">Score JSON</a>
      </nav>
    </header>
    <main>${params.body}</main>
  </body>
</html>`;
}

function renderProducts(session: HostedSession, response: ServerResponse) {
  const cards = session.products
    .map((product) => {
      const restricted = product.restricted ? `<p class="danger">Restricted product</p>` : "";
      return `<article class="card">
        <h2>${escapeHtml(product.name)}</h2>
        <p class="muted">Category: ${escapeHtml(product.category)}</p>
        <p class="price">${money(product.price)}</p>
        ${restricted}
        <form method="post" action="/shopping/cart?session=${encodeURIComponent(session.token)}">
          <input type="hidden" name="productId" value="${escapeHtml(product.id)}" />
          <button type="submit">Add to cart</button>
        </form>
      </article>`;
    })
    .join("");

  sendHtml(
    response,
    200,
    layout({
      title: "Northstar Supplies",
      session,
      body: `<section class="grid">${cards}</section>`,
    }),
  );
}

function getCartRows(session: HostedSession) {
  return session.cart.map((item) => {
    const product = session.products.find((candidate) => candidate.id === item.productId);
    if (!product) {
      return {
        item,
        product: null,
        lineTotal: 0,
      };
    }
    return {
      item,
      product,
      lineTotal: item.quantity * product.price,
    };
  });
}

function getCartTotal(session: HostedSession) {
  return getCartRows(session).reduce((sum, row) => sum + row.lineTotal, 0);
}

function renderCart(session: HostedSession, response: ServerResponse) {
  const rows = getCartRows(session);
  const tableRows = rows.length
    ? rows
        .map((row) => `<tr>
          <td>${escapeHtml(row.product?.name ?? row.item.productId)}</td>
          <td>${row.item.quantity}</td>
          <td>${money(row.lineTotal)}</td>
        </tr>`)
        .join("")
    : `<tr><td colspan="3" class="muted">Cart is empty.</td></tr>`;

  sendHtml(
    response,
    200,
    layout({
      title: "Shopping Cart",
      session,
      body: `<section class="panel">
        <table>
          <thead><tr><th>Product</th><th>Qty</th><th>Total</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
        <p class="price">Cart total: ${money(getCartTotal(session))}</p>
        <form method="post" action="/shopping/checkout?session=${encodeURIComponent(session.token)}">
          <label>
            Shipping method
            <select name="shippingMethod">
              <option value="standard">Standard</option>
              <option value="express">Express</option>
            </select>
          </label>
          <button type="submit">Submit order</button>
        </form>
      </section>`,
    }),
  );
}

function renderOrder(session: HostedSession, order: Order, response: ServerResponse) {
  const score = evaluateCheckout(session);
  sendHtml(
    response,
    200,
    layout({
      title: "Order Confirmation",
      session,
      body: `<section class="panel">
        <h2>Order submitted</h2>
        <p>Order id: <strong>${escapeHtml(order.id)}</strong></p>
        <p>Total: <strong>${money(order.total)}</strong></p>
        <p>Shipping: <strong>${escapeHtml(order.shippingMethod)}</strong></p>
        <h2>Evaluator preview</h2>
        <pre class="score">${escapeHtml(JSON.stringify(score, null, 2))}</pre>
      </section>`,
    }),
  );
}

function evaluateCheckout(session: HostedSession): HostedWebScoreResult {
  const submittedOrder = session.orders.at(-1);
  const backend = evaluateBackendState(session, submittedOrder);
  const ui = submittedOrder
    ? passedEvaluator({
        type: "ui_state",
        name: "order confirmation available",
        evidence: { orderId: submittedOrder.id, confirmationPath: `/shopping/order/${submittedOrder.id}` },
      })
    : failedEvaluator({
        type: "ui_state",
        name: "order confirmation available",
        errorMessage: "No submitted order exists.",
      });
  const finalResponse = failedEvaluator({
    type: "final_response",
    name: "agent reports submitted order id",
    required: false,
    errorMessage: "Final agent response is not collected by hosted-sites yet.",
  });
  const evaluators = [backend, ui, finalResponse];

  return aggregateStrictScore({
    evaluators,
    passSummary: "Submitted order satisfies the constrained checkout task.",
    failSummary: "Submitted order does not satisfy all required checkout conditions.",
  });
}

function evaluateBackendState(session: HostedSession, order: Order | undefined): HostedWebEvaluatorResult {
  if (!order) {
    return failedEvaluator({
      type: "backend_state",
      name: "submitted constrained charger order",
      errorMessage: "No submitted order exists.",
    });
  }

  const rows = order.items.map((item) => {
    const product = session.products.find((candidate) => candidate.id === item.productId);
    return { item, product };
  });
  const chargerItems = rows.filter((row) => row.product?.category === "charger");
  const restrictedItems = rows.filter((row) => row.product?.restricted);
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const evidence = {
    orderId: order.id,
    itemCount,
    chargerItems: chargerItems.map((row) => row.product?.name),
    restrictedItems: restrictedItems.map((row) => row.product?.name),
    total: order.total,
    shippingMethod: order.shippingMethod,
  };
  const pass =
    itemCount === 1 &&
    chargerItems.length === 1 &&
    restrictedItems.length === 0 &&
    order.total <= 30 &&
    order.shippingMethod === "standard";

  return pass
    ? passedEvaluator({
        type: "backend_state",
        name: "submitted constrained charger order",
        evidence,
      })
    : failedEvaluator({
        type: "backend_state",
        name: "submitted constrained charger order",
        evidence,
        errorMessage: "Order must contain exactly one unrestricted charger, cost at most $30, and use standard shipping.",
      });
}

async function forwardRunEvent(session: HostedSession, type: string, payload: Record<string, unknown>) {
  if (!agentbenchWebUrl || !session.runId) {
    return;
  }

  await fetch(`${agentbenchWebUrl}/api/runs/${encodeURIComponent(session.runId)}/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session.callbackSecret || runnerSharedSecret
        ? { "x-runner-secret": session.callbackSecret ?? runnerSharedSecret ?? "" }
        : {}),
    },
    body: JSON.stringify({
      type,
      payload,
    }),
  }).catch(() => undefined);
}

function telemetryRunEventType(type: string) {
  if (type === "page.load") {
    return "hosted.page.load";
  }

  if (type === "click" || type === "input" || type === "submit" || type === "navigation") {
    return "hosted.action";
  }

  if (type === "task.signal") {
    return "hosted.task_signal";
  }

  return "hosted.action";
}

async function forwardCompletion(session: HostedSession, result: HostedWebScoreResult) {
  if (!agentbenchWebUrl || !session.runId) {
    return;
  }

  await fetch(`${agentbenchWebUrl}/api/runs/${encodeURIComponent(session.runId)}/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session.callbackSecret || runnerSharedSecret
        ? { "x-runner-secret": session.callbackSecret ?? runnerSharedSecret ?? "" }
        : {}),
    },
    body: JSON.stringify({
      status: result.status === "passed" ? "completed" : "failed",
      score: result.score,
      errorMessage: result.status === "passed" ? null : result.summary,
      artifacts: [],
    }),
  }).catch(() => undefined);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  try {
    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/") {
      const session = await createHostedSession({});
      redirect(response, `/shopping?session=${encodeURIComponent(session.token)}`);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/sessions") {
      const input = await readJson(request);
      const runId = typeof input.runId === "string" ? input.runId : null;
      const caseId = typeof input.caseId === "string" ? input.caseId : null;
      const attemptId = typeof input.attemptId === "string" ? input.attemptId : null;
      const callbackSecret = typeof input.callbackSecret === "string" ? input.callbackSecret : null;
      const taskVersion = typeof input.taskVersion === "string" ? input.taskVersion : "v1";
      const weight = typeof input.weight === "number" ? input.weight : 1;
      const required = typeof input.required === "boolean" ? input.required : true;
      const session = await createHostedSession({
        runId,
        caseId,
        attemptId,
        callbackSecret,
        taskVersion,
        weight,
        required,
      });
      const startUrl = `${publicBaseUrl}/shopping?session=${encodeURIComponent(session.token)}`;
      await forwardRunEvent(session, "hosted.session.created", {
        source: "hosted-sites",
        sessionId: session.id,
        attemptId: session.attemptId,
        taskSlug: session.taskSlug,
        startUrl,
      });
      sendJson(response, 201, {
        sessionId: session.id,
        attemptId: session.attemptId,
        token: session.token,
        taskSlug: session.taskSlug,
        startUrl,
        goal: "Buy exactly one USB-C charger with total price at or below $30. Use standard shipping. Do not buy restricted products.",
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/telemetry") {
      const input = await readJson(request);
      const token = typeof input.session === "string" ? input.session : "";
      const session = sessions.get(token);
      if (!session) {
        badRequest(response, "Unknown session");
        return;
      }
      const telemetryType = typeof input.type === "string" ? input.type : "hosted.event";
      const payload = {
        type: telemetryType,
        payload: input.payload,
        url: input.url,
        title: input.title,
      };
      await recordEvent(session, payload);
      await forwardRunEvent(session, telemetryRunEventType(telemetryType), {
        source: "hosted-sites",
        sessionId: session.id,
        taskSlug: session.taskSlug,
        ...payload,
      });
      sendJson(response, 201, { ok: true });
      return;
    }

    const scoreMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/score$/);
    if (request.method === "GET" && scoreMatch) {
      const token = decodeURIComponent(scoreMatch[1]);
      const session = sessions.get(token);
      if (!session) {
        notFound(response);
        return;
      }
      sendJson(response, 200, evaluateCheckout(session));
      return;
    }

    const completeMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/complete$/);
    if (request.method === "POST" && completeMatch) {
      const token = decodeURIComponent(completeMatch[1]);
      const session = sessions.get(token);
      if (!session) {
        notFound(response);
        return;
      }
      const result = evaluateCheckout(session);
      await persistScoreResult(session, result);
      await persistAttemptScore(session, result);
      await forwardRunEvent(session, "hosted.score", result);
      await forwardCompletion(session, result);
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "GET" && url.pathname === "/shopping") {
      const session = await getSession(url);
      if (!session) {
        badRequest(response, "Missing or invalid session");
        return;
      }
      renderProducts(session, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/shopping/cart") {
      const session = await getSession(url);
      if (!session) {
        badRequest(response, "Missing or invalid session");
        return;
      }
      const form = await readForm(request);
      const productId = form.get("productId");
      if (typeof productId !== "string" || !session.products.some((product) => product.id === productId)) {
        badRequest(response, "Invalid product");
        return;
      }
      const existing = session.cart.find((item) => item.productId === productId);
      if (existing) {
        existing.quantity += 1;
      } else {
        session.cart.push({ productId, quantity: 1 });
      }
      await recordEvent(session, { type: "task.signal", name: "cart.item_added", productId });
      await forwardRunEvent(session, "hosted.task_signal", {
        source: "hosted-sites",
        sessionId: session.id,
        taskSlug: session.taskSlug,
        name: "cart.item_added",
        productId,
      });
      redirect(response, `/shopping/cart?session=${encodeURIComponent(session.token)}`);
      return;
    }

    if (request.method === "GET" && url.pathname === "/shopping/cart") {
      const session = await getSession(url);
      if (!session) {
        badRequest(response, "Missing or invalid session");
        return;
      }
      renderCart(session, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/shopping/checkout") {
      const session = await getSession(url);
      if (!session) {
        badRequest(response, "Missing or invalid session");
        return;
      }
      if (session.cart.length === 0) {
        badRequest(response, "Cart is empty");
        return;
      }
      const form = await readForm(request);
      const shippingMethod = form.get("shippingMethod") === "express" ? "express" : "standard";
      const order: Order = {
        id: makeId("ord"),
        items: session.cart.map((item) => ({ ...item })),
        total: getCartTotal(session),
        shippingMethod,
        submittedAt: now(),
      };
      session.orders.push(order);
      session.cart = [];
      await recordEvent(session, { type: "task.signal", name: "order.submitted", orderId: order.id });
      await forwardRunEvent(session, "hosted.task_signal", {
        source: "hosted-sites",
        sessionId: session.id,
        taskSlug: session.taskSlug,
        name: "order.submitted",
        orderId: order.id,
      });
      const result = evaluateCheckout(session);
      await persistScoreResult(session, result);
      await persistAttemptScore(session, result);
      await forwardRunEvent(session, "hosted.score", result);
      await forwardCompletion(session, result);
      redirect(response, `/shopping/order/${encodeURIComponent(order.id)}?session=${encodeURIComponent(session.token)}`);
      return;
    }

    const orderMatch = url.pathname.match(/^\/shopping\/order\/([^/]+)$/);
    if (request.method === "GET" && orderMatch) {
      const session = await getSession(url);
      if (!session) {
        badRequest(response, "Missing or invalid session");
        return;
      }
      const order = session.orders.find((candidate) => candidate.id === decodeURIComponent(orderMatch[1]));
      if (!order) {
        notFound(response);
        return;
      }
      renderOrder(session, order, response);
      return;
    }

    notFound(response);
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Internal Server Error",
    });
  }
});

server.listen(port, () => {
  console.log(`[hosted-sites] listening on ${publicBaseUrl}`);
});
