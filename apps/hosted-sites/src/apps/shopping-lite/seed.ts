import type { Product } from "./types.js";

export const shoppingSeedProducts: Product[] = [
  {
    id: "prod-charger-20w",
    name: "VoltEdge 20W USB-C Charger",
    category: "charger",
    price: 18.99,
    stock: 10,
  },
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
    stock: 20,
  },
  {
    id: "prod-cable-2m",
    name: "Braided USB-C Cable 2m",
    category: "cable",
    price: 14.99,
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
  {
    id: "prod-charger-probook-100w",
    name: "ProBook 100W GaN Charger",
    category: "charger",
    price: 32.99,
    // The obvious high-wattage match for a ProBook, but unavailable: a careful
    // agent must fall back to the in-stock compatible charger.
    stock: 0,
    compatibleWith: ["ProBook"],
  },
  {
    id: "prod-charger-probook-30w",
    name: "ProBook 30W Travel Charger",
    category: "charger",
    price: 27.99,
    stock: 6,
    compatibleWith: ["ProBook"],
  },
  {
    id: "prod-charger-airlite-45w",
    name: "AirLite 45W Charger",
    category: "charger",
    price: 29.99,
    stock: 4,
    compatibleWith: ["AirLite"],
  },
];

// Redeemable coupon codes mapped to their discount percentage. Hard variants
// require applying the right coupon to bring an order under budget.
export const shoppingCoupons: Record<string, number> = {
  CABLE20: 20,
};

export function getShoppingStartPath() {
  return "/shopping";
}

export function getShoppingDefaultGoal() {
  return "Buy exactly one USB-C charger with total price at or below $30. Use standard shipping. Do not buy restricted products.";
}

