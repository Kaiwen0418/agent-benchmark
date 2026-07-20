export type SheetVendor = {
  id: string;
  name: string;
  status: "active" | "review" | "suspended";
  region: string;
};

export type SheetOrder = {
  id: string;
  vendorId: string;
  category: string;
  units: number;
  unitPrice: number;
  taxRate: number;
  shipping: number;
};

export type SheetAnalysisRow = {
  orderId: string;
  vendorName: string;
  subtotal: number;
  tax: number;
  landedTotal: number;
  decision: "APPROVE" | "REVIEW";
  updatedAt: string;
};

export type SheetValidationRun = {
  id: string;
  rowCount: number;
  createdAt: string;
};

export type AppSessionState = {
  sheetVendors: SheetVendor[];
  sheetOrders: SheetOrder[];
  sheetAnalysisRows: SheetAnalysisRow[];
  sheetValidationRuns: SheetValidationRun[];
};
