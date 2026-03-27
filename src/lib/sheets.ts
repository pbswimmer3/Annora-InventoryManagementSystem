import { google } from "googleapis";
import { InventoryItem } from "./types";

const SHEET_NAME = "Inventory";
const RANGE = `${SHEET_NAME}!A:J`;

function getAuth() {
  let key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "";
  // Support base64-encoded key
  if (!key.startsWith("{")) {
    key = Buffer.from(key, "base64").toString("utf-8");
  }
  const credentials = JSON.parse(key);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getSheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ID not set");
  return id;
}

// --- In-memory cache ---
let cache: InventoryItem[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000; // 60 seconds

export function invalidateCache() {
  cache = null;
  cacheTimestamp = 0;
}

function isCacheValid(): boolean {
  return cache !== null && Date.now() - cacheTimestamp < CACHE_TTL;
}

// --- Retry with exponential backoff ---
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500));
    }
  }
  throw new Error("Unreachable");
}

function rowToItem(row: string[]): InventoryItem {
  return {
    itemId: row[0] || "",
    name: row[1] || "",
    category: row[2] || "",
    size: row[3] || "",
    color: row[4] || "",
    material: row[5] || "",
    quantity: parseInt(row[6] || "0", 10),
    dateAdded: row[7] || "",
    lastRestocked: row[8] || "",
    lastSold: row[9] || "",
  };
}

export async function getAllItems(): Promise<InventoryItem[]> {
  if (isCacheValid()) return cache!;

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: getSheetId(),
      range: RANGE,
    })
  );

  const rows = res.data.values || [];
  // Skip header row
  const items = rows.slice(1).map(rowToItem);
  cache = items;
  cacheTimestamp = Date.now();
  return items;
}

export async function appendItem(item: InventoryItem): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  await withRetry(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId: getSheetId(),
      range: RANGE,
      valueInputOption: "RAW",
      requestBody: {
        values: [
          [
            item.itemId,
            item.name,
            item.category,
            item.size,
            item.color,
            item.material,
            item.quantity.toString(),
            item.dateAdded,
            item.lastRestocked,
            item.lastSold,
          ],
        ],
      },
    })
  );

  invalidateCache();
}

export async function updateItem(
  itemId: string,
  updates: Partial<Pick<InventoryItem, "quantity" | "lastRestocked" | "lastSold">>
): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  // We need to find the row index first
  const items = await getAllItems();
  const rowIndex = items.findIndex((i) => i.itemId === itemId);
  if (rowIndex === -1) throw new Error(`Item not found: ${itemId}`);

  const item = { ...items[rowIndex], ...updates };
  const sheetRow = rowIndex + 2; // +1 for header, +1 for 1-based index

  await withRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId: getSheetId(),
      range: `${SHEET_NAME}!A${sheetRow}:J${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [
          [
            item.itemId,
            item.name,
            item.category,
            item.size,
            item.color,
            item.material,
            item.quantity.toString(),
            item.dateAdded,
            item.lastRestocked,
            item.lastSold,
          ],
        ],
      },
    })
  );

  invalidateCache();
}
