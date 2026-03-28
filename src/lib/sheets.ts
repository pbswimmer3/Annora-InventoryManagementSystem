import { google } from "googleapis";
import { InventoryItem } from "./types";

const SHEET_NAME = "Inventory";
const RANGE = `${SHEET_NAME}!A:J`;
const LOG_SHEET = "Log";
const LOG_RANGE = `${LOG_SHEET}!A:D`;

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

function itemToRow(item: InventoryItem): string[] {
  return [
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
  ];
}

export async function appendItem(item: InventoryItem): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  await withRetry(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId: getSheetId(),
      range: RANGE,
      valueInputOption: "RAW",
      requestBody: { values: [itemToRow(item)] },
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
      requestBody: { values: [itemToRow(item)] },
    })
  );

  invalidateCache();
}

// --- Activity Logging ---
export async function logAction(
  action: string,
  itemId: string,
  details: string
): Promise<void> {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });
    const timestamp = new Date().toISOString();

    await sheets.spreadsheets.values.append({
      spreadsheetId: getSheetId(),
      range: LOG_RANGE,
      valueInputOption: "RAW",
      requestBody: {
        values: [[timestamp, action, itemId, details]],
      },
    });
  } catch (err) {
    // Logging should never block the main operation
    console.error("Failed to write log:", err);
  }
}

// --- Backup ---
export async function createBackup(): Promise<string> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = getSheetId();

  // Get the Inventory sheet's numeric sheetId
  const spreadsheet = await withRetry(() =>
    sheets.spreadsheets.get({ spreadsheetId })
  );
  const inventorySheet = spreadsheet.data.sheets?.find(
    (s) => s.properties?.title === SHEET_NAME
  );
  if (!inventorySheet?.properties?.sheetId && inventorySheet?.properties?.sheetId !== 0) {
    throw new Error("Inventory sheet not found");
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const backupName = `Backup-${dateStr}`;

  // If today's backup already exists, delete it first
  const existingBackup = spreadsheet.data.sheets?.find(
    (s) => s.properties?.title === backupName
  );
  if (existingBackup?.properties?.sheetId !== undefined) {
    await withRetry(() =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            { deleteSheet: { sheetId: existingBackup.properties!.sheetId! } },
          ],
        },
      })
    );
  }

  // Duplicate the Inventory sheet
  const dup = await withRetry(() =>
    sheets.spreadsheets.sheets.copyTo({
      spreadsheetId,
      sheetId: inventorySheet.properties!.sheetId!,
      requestBody: { destinationSpreadsheetId: spreadsheetId },
    })
  );

  // Rename the copy to today's backup name
  await withRetry(() =>
    sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: { sheetId: dup.data.sheetId!, title: backupName },
              fields: "title",
            },
          },
        ],
      },
    })
  );

  return backupName;
}
