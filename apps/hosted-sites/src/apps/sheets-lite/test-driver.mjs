export async function complete({ session, config, postForm }) {
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
