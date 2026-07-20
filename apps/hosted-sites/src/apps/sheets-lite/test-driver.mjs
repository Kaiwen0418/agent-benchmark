export async function complete({ session, config, hostedBaseUrl, checkedFetch, postForm }) {
  // Trigger and recover the capability suite's deterministic stale-view fault
  // before applying mutations, so the lifecycle smoke proves recovery without
  // duplicating a row update.
  await checkedFetch(`${hostedBaseUrl}/sheets?session=${encodeURIComponent(session.token)}`);
  await checkedFetch(`${hostedBaseUrl}/sheets?session=${encodeURIComponent(session.token)}`);
  await postForm("/sheets/rows/PO-101/delete", session.token, {});
  for (const row of config.expectedRows) {
    await postForm("/sheets/rows", session.token, {
      orderId: row.orderId,
      vendorName: row.vendorName,
      subtotal: String(row.subtotal),
      tax: String(row.tax),
      landedTotal: String(row.landedTotal),
      decision: row.decision,
    });
  }
  await postForm("/sheets/validate", session.token, {});
}
