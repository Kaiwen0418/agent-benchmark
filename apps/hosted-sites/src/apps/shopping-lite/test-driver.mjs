export async function complete({ session, config, checkedFetch, postForm, requireString }) {
  const cheapestByCategory = {
    charger: "prod-charger-20w",
    cable: "prod-cable-1m",
    case: "prod-case",
  };
  // In-stock products certified for a specific device, keyed by device then category.
  const compatibleByDevice = {
    ProBook: { charger: "prod-charger-probook-30w" },
    AirLite: { charger: "prod-charger-airlite-45w" },
  };

  const requiredDevice = typeof config.requiredDevice === "string" ? config.requiredDevice : null;
  const primaryProductId = requiredDevice
    ? compatibleByDevice[requiredDevice]?.[config.targetCategory]
    : cheapestByCategory[config.targetCategory];
  if (!primaryProductId) {
    throw new Error(
      requiredDevice
        ? `No in-stock ${config.targetCategory} compatible with ${requiredDevice}`
        : `Unsupported shopping category: ${config.targetCategory}`,
    );
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

  const checkoutValues = {
    shippingMethod: requireString(config.shippingMethod, "shopping shippingMethod"),
  };
  if (typeof config.couponCode === "string" && config.couponCode.length > 0) {
    checkoutValues.couponCode = config.couponCode;
  }
  await postForm("/shopping/checkout", session.token, checkoutValues);
}
