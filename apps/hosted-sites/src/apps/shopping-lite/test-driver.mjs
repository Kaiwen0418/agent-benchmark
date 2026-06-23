export async function complete({ session, config, checkedFetch, postForm, requireString }) {
  const productByCategory = {
    charger: "prod-charger-30w",
    cable: "prod-cable-1m",
    case: "prod-case",
  };
  const productId = productByCategory[config.targetCategory];
  if (!productId) {
    throw new Error(`Unsupported shopping category: ${config.targetCategory}`);
  }
  const quantity = Number(config.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error(`Invalid shopping quantity: ${config.quantity}`);
  }

  await checkedFetch(session.startUrl);
  for (let count = 0; count < quantity; count += 1) {
    await postForm("/shopping/cart", session.token, { productId });
  }
  await postForm("/shopping/checkout", session.token, {
    shippingMethod: requireString(config.shippingMethod, "shopping shippingMethod"),
  });
}
