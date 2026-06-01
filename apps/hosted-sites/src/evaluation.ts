import {
  aggregateStrictScore,
  failedEvaluator,
  passedEvaluator,
  type HostedWebEvaluatorResult,
  type HostedWebScoreResult,
} from "@agentbench/scoring";

export type HostedEvaluationProduct = {
  id: string;
  name: string;
  category: "charger" | "cable" | "adapter" | "case";
  price: number;
  restricted?: boolean;
};

export type HostedEvaluationCartItem = {
  productId: string;
  quantity: number;
};

export type HostedEvaluationOrder = {
  id: string;
  items: HostedEvaluationCartItem[];
  total: number;
  shippingMethod: "standard" | "express";
  submittedAt: string;
};

export type HostedEvaluationWikiAnswerSubmission = {
  answer: string;
  submittedAt: string;
};

export type HostedEvaluationSession = {
  app: string;
  taskSlug: string;
  products: HostedEvaluationProduct[];
  orders: HostedEvaluationOrder[];
  metadata: Record<string, unknown>;
  events: Array<Record<string, unknown>>;
  wikiAnswerSubmissions: HostedEvaluationWikiAnswerSubmission[];
};

export function evaluateCheckout(session: HostedEvaluationSession): HostedWebScoreResult {
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

  return aggregateStrictScore({
    evaluators: [backend, ui, finalResponse],
    passSummary: "Submitted order satisfies the constrained checkout task.",
    failSummary: "Submitted order does not satisfy all required checkout conditions.",
  });
}

export function normalizeAnswer(value: string) {
  return value.trim().toLowerCase().replaceAll(/[,\.]/g, "");
}

export function evaluateWiki(session: HostedEvaluationSession): HostedWebScoreResult {
  const expectedAnswer = "June 1, 2026";
  const latestAnswer = session.wikiAnswerSubmissions.at(-1);
  const viewedArticleSlugs = Array.isArray(session.metadata.viewedArticleSlugs)
    ? session.metadata.viewedArticleSlugs.filter((value): value is string => typeof value === "string")
    : [];
  const articleViewed =
    session.events.some(
      (event) =>
        event.type === "page.load" &&
        typeof event.url === "string" &&
        String(event.url).includes("/wiki/article/agentbench-release-history"),
    ) || viewedArticleSlugs.includes("agentbench-release-history");
  const answerMatches = latestAnswer ? normalizeAnswer(latestAnswer.answer) === normalizeAnswer(expectedAnswer) : false;

  const retrieveValue = answerMatches
    ? passedEvaluator({
        type: "retrieve_value",
        name: "retrieved hosted-web wiki follow-up date",
        evidence: { answer: latestAnswer?.answer, expectedAnswer },
      })
    : failedEvaluator({
        type: "retrieve_value",
        name: "retrieved hosted-web wiki follow-up date",
        errorMessage: "Submitted answer does not match the expected date.",
        evidence: { answer: latestAnswer?.answer ?? null, expectedAnswer },
      });
  const backendState = latestAnswer
    ? passedEvaluator({
        type: "backend_state",
        name: "answer submission persisted",
        evidence: { answer: latestAnswer.answer, submittedAt: latestAnswer.submittedAt },
      })
    : failedEvaluator({
        type: "backend_state",
        name: "answer submission persisted",
        errorMessage: "No answer was submitted.",
      });
  const uiState = articleViewed
    ? passedEvaluator({
        type: "ui_state",
        name: "release history article viewed",
        evidence: { article: "agentbench-release-history" },
      })
    : failedEvaluator({
        type: "ui_state",
        name: "release history article viewed",
        errorMessage: "The required article was not opened.",
      });

  return aggregateStrictScore({
    evaluators: [retrieveValue, backendState, uiState],
    passSummary: "Submitted answer matches the hosted wiki release-history task.",
    failSummary: "Wiki task requires opening the release-history article and submitting the exact date.",
  });
}

export function evaluateSession(session: HostedEvaluationSession): HostedWebScoreResult {
  return session.app === "wiki-lite" ? evaluateWiki(session) : evaluateCheckout(session);
}

export function evaluateBackendState(
  session: HostedEvaluationSession,
  order: HostedEvaluationOrder | undefined,
): HostedWebEvaluatorResult {
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
