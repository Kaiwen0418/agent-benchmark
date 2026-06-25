export async function complete({ session, config, checkedFetch, postForm, requireString }) {
  const cheapestByCategory = {
    charger: "prod-charger-20w",
    cable: "prod-cable-1m",
    case: "prod-case",
  };
  const primaryProductId = cheapestByCategory[config.targetCategory];
  if (!primaryProductId) {
    throw new Error(`Unsupported shopping category: ${config.targetCategory}`);
  }
  const quantity = Number(config.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error(`Invalid shopping quantity: ${config.quantity}`);
  }

  await checkedFetch(session.startUrl);
  for (let count = 0; count < quantity; count += 1) {
    await postForm("/shopping/cart", session.token, { productId: primaryProductId });
  }

  if (config.secondaryCategory) {
    const secondaryProductId = cheapestByCategory[config.secondaryCategory];
    if (!secondaryProductId) {
      throw new Error(`Unsupported secondary shopping category: ${config.secondaryCategory}`);
    }
    const secondaryQuantity = Number(config.secondaryQuantity ?? 1);
    for (let count = 0; count < secondaryQuantity; count += 1) {
      await postForm("/shopping/cart", session.token, { productId: secondaryProductId });
    }
  }

  await postForm("/shopping/checkout", session.token, {
    shippingMethod: requireString(config.shippingMethod, "shopping shippingMethod"),
  });
}
