export type Product = {
  id: string;
  name: string;
  category: "charger" | "cable" | "adapter" | "case";
  price: number;
  restricted?: boolean;
};

export type CartItem = {
  productId: string;
  quantity: number;
};

export type Order = {
  id: string;
  items: CartItem[];
  total: number;
  shippingMethod: "standard" | "express";
  submittedAt: string;
};

export type AppSessionState = {
  products: Product[];
  cart: CartItem[];
  orders: Order[];
};
