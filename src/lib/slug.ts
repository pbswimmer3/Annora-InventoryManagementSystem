const SIZE_MAP: Record<string, string> = {
  SMALL: "SM",
  MEDIUM: "MD",
  LARGE: "LG",
  XL: "XL",
  XXL: "XXL",
  SM: "SM",
  MD: "MD",
  LG: "LG",
};

function sanitize(str: string, maxLen = 20): string {
  return str
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, maxLen);
}

function randomDigits(count: number): string {
  let result = "";
  for (let i = 0; i < count; i++) {
    result += Math.floor(Math.random() * 10).toString();
  }
  return result;
}

export function generateSlug(
  color: string,
  name: string,
  category: string,
  size: string,
  supplierPrice: number
): string {
  const sizeAbbr = SIZE_MAP[size.toUpperCase()] || size.toUpperCase().slice(0, 3);
  const roundedPrice = Math.round(supplierPrice).toString();
  const priceCode = `${randomDigits(3)}${roundedPrice}${randomDigits(3)}`;
  return `${priceCode}-${sanitize(color)}-${sanitize(name)}-${sanitize(category)}-${sizeAbbr}`;
}
