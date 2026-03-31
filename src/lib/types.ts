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
  listPrice: number;
}

export const CATEGORIES = [
  "Dupatta",
  "Gowns/Anarkali",
  "Indo-Western",
  "Jewelry",
  "Kurti",
  "Lehenga",
  "Men's Kurta",
  "Men's Sherwani",
  "Men's Vest",
  "Other",
  "Pre-Draped Saree",
  "Salwar Kameez",
  "Saree",
  "Sharara",
] as const;

export const SIZES = ["Earrings", "Necklace", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "34", "36", "38", "40", "42", "44", "46", "48", "50", "52", "54", "56", "58", "60"] as const;

export type Category = (typeof CATEGORIES)[number];
export type Size = (typeof SIZES)[number];
