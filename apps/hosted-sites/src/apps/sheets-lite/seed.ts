import type { SheetOrder, SheetVendor } from "./types.js";

export const sheetSeedVendors: SheetVendor[] = [
  { id: "V-01", name: "Northstar Components", status: "active", region: "UK" },
  { id: "V-02", name: "Bluebird Industrial", status: "review", region: "EU" },
  { id: "V-03", name: "Cedar Supply", status: "active", region: "UK" },
  { id: "V-04", name: "Delta Systems", status: "suspended", region: "US" },
];

export const sheetSeedOrders: SheetOrder[] = [
  { id: "PO-101", vendorId: "V-01", category: "equipment", units: 5, unitPrice: 120, taxRate: 0.2, shipping: 25 },
  { id: "PO-102", vendorId: "V-02", category: "equipment", units: 3, unitPrice: 200, taxRate: 0.2, shipping: 20 },
  { id: "PO-103", vendorId: "V-03", category: "services", units: 10, unitPrice: 75, taxRate: 0.2, shipping: 0 },
  { id: "PO-104", vendorId: "V-03", category: "equipment", units: 8, unitPrice: 90, taxRate: 0.2, shipping: 30 },
  { id: "PO-105", vendorId: "V-04", category: "equipment", units: 2, unitPrice: 300, taxRate: 0.2, shipping: 15 },
  { id: "PO-106", vendorId: "V-01", category: "equipment", units: 10, unitPrice: 110, taxRate: 0.2, shipping: 40 },
  { id: "PO-107", vendorId: "V-02", category: "supplies", units: 20, unitPrice: 15, taxRate: 0.2, shipping: 10 },
];

export function getSheetsLiteStartPath() {
  return "/sheets";
}

export function getSheetsLiteDefaultGoal() {
  return "Join the Orders and Vendors sheets, calculate the requested rows, and validate the analysis.";
}
