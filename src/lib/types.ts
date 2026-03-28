export interface InventoryItem {
  itemId: string;
  name: string;
  category: string;
  size: string;
  color: string;
  material: string;
  quantity: number;
  dateAdded: string;
  lastRestocked: string;
  lastSold: string;
  supplierPrice: number;
  salePrice: number;
  photoUrl: string;
}

export const CATEGORIES = [
  "Sari",
  "Salwar Kameez",
  "Kurta",
  "Dupatta",
  "Lehenga",
  "Other",
] as const;

export const SIZES = ["SM", "MD", "LG", "XL", "XXL"] as const;

export type Category = (typeof CATEGORIES)[number];
export type Size = (typeof SIZES)[number];
