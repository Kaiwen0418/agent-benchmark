import type { Product } from "./types.js";

export const shoppingSeedProducts: Product[] = [
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

export function getShoppingStartPath() {
  return "/shopping";
}

export function getShoppingDefaultGoal() {
  return "Buy exactly one USB-C charger with total price at or below $30. Use standard shipping. Do not buy restricted products.";
}
