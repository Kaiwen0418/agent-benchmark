export type Product = {
  id: string;
  name: string;
  category: "charger" | "cable" | "adapter" | "case";
  price: number;
  restricted?: boolean;
  // Undefined stock means the product is always available; a finite stock caps
  // how many units a single order may contain. Hard variants rely on this to
  // make an obvious-but-unavailable option unusable.
  stock?: number;
  // Devices the product is certified to work with. Hard variants require the
  // ordered product to be compatible with a generated target device.
  compatibleWith?: string[];
};

export type CartItem = {
  productId: string;
  quantity: number;
};

export type Order = {
  id: string;
  items: CartItem[];
  total: number;
  subtotal?: number;
  shippingMethod: "standard" | "express";
  shippingCost?: number;
  // Coupon redeemed at checkout and the resulting discount, when a hard variant
  // requires the agent to apply one to stay under budget.
  couponCode?: string;
  discountAmount?: number;
  submittedAt: string;
};

export type AppSessionState = {
  products: Product[];
  cart: CartItem[];
  orders: Order[];
};
