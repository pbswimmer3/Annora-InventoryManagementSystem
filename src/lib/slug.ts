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

export function generateSlug(
  color: string,
  name: string,
  category: string,
  size: string
): string {
  const sizeAbbr = SIZE_MAP[size.toUpperCase()] || size.toUpperCase().slice(0, 3);
  return `${sanitize(color)}-${sanitize(name)}-${sanitize(category)}-${sizeAbbr}`;
}
