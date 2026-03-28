import { google } from "googleapis";
import { Readable } from "node:stream";
import { InventoryItem } from "./types";

const SHEET_NAME = "Inventory";
const RANGE = `${SHEET_NAME}!A:M`;
const LOG_SHEET = "Log";
const LOG_RANGE = `${LOG_SHEET}!A:D`;

// Service account auth — used for Google Sheets only
function getSheetsAuth() {
  let key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "";
  if (!key.startsWith("{")) {
    key = Buffer.from(key, "base64").toString("utf-8");
  }
  const credentials = JSON.parse(key);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

// OAuth2 auth — used for Google Drive uploads (service accounts have no storage quota)
function getDriveAuth() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google OAuth2 credentials not set (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)");
  }
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

function getSheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ID not set");
  return id;
}

// --- In-memory cache ---
let cache: InventoryItem[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000;

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
    supplierPrice: parseFloat(row[10] || "0"),
    salePrice: parseFloat(row[11] || "0"),
    photoUrl: row[12] || "",
  };
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
    item.supplierPrice.toString(),
    item.salePrice.toString(),
    item.photoUrl,
  ];
}

export async function getAllItems(): Promise<InventoryItem[]> {
  if (isCacheValid()) return cache!;

  const auth = getSheetsAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: getSheetId(),
      range: RANGE,
    })
  );

  const rows = res.data.values || [];
  const items = rows.slice(1).map(rowToItem);
  cache = items;
  cacheTimestamp = Date.now();
  return items;
}

export async function appendItem(item: InventoryItem): Promise<void> {
  const auth = getSheetsAuth();
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
  updates: Partial<Pick<InventoryItem, "quantity" | "lastRestocked" | "lastSold" | "salePrice" | "photoUrl">>
): Promise<void> {
  const auth = getSheetsAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const items = await getAllItems();
  const rowIndex = items.findIndex((i) => i.itemId === itemId);
  if (rowIndex === -1) throw new Error(`Item not found: ${itemId}`);

  const item = { ...items[rowIndex], ...updates };
  const sheetRow = rowIndex + 2;

  await withRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId: getSheetId(),
      range: `${SHEET_NAME}!A${sheetRow}:M${sheetRow}`,
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
    const auth = getSheetsAuth();
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
    console.error("Failed to write log:", err);
  }
}

// --- Photo Upload to Google Drive ---
export async function uploadPhoto(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string> {
  const auth = getDriveAuth();
  const drive = google.drive({ version: "v3", auth });

  // Step 1: Get or create the photos folder in the OAuth user's Drive
  const folderId = await getOrCreatePhotosFolder(drive);

  // Step 2: Upload file (fresh stream each attempt since streams are consumed once)
  const res = await withRetry(() =>
    drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: Readable.from(Buffer.from(fileBuffer)),
      },
      fields: "id",
    })
  );

  const fileId = res.data.id;
  if (!fileId) throw new Error("Drive upload returned no file ID");

  // Step 3: Make publicly viewable
  await withRetry(() =>
    drive.permissions.create({
      fileId,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    })
  );

  return `https://lh3.googleusercontent.com/d/${fileId}=w400`;
}

let photosFolderId: string | null = null;

async function getOrCreatePhotosFolder(
  drive: ReturnType<typeof google.drive>
): Promise<string> {
  if (photosFolderId) return photosFolderId;

  const list = await drive.files.list({
    q: "name = 'Annora-Inventory-Photos' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
    fields: "files(id)",
  });

  if (list.data.files && list.data.files.length > 0) {
    photosFolderId = list.data.files[0].id!;
    return photosFolderId;
  }

  const folder = await drive.files.create({
    requestBody: {
      name: "Annora-Inventory-Photos",
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });

  photosFolderId = folder.data.id!;
  return photosFolderId;
}

// --- Backup ---
export async function createBackup(): Promise<string> {
  const auth = getSheetsAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = getSheetId();

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
  const dateStr = now.toISOString().slice(0, 10);
  const backupName = `Backup-${dateStr}`;

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

  const dup = await withRetry(() =>
    sheets.spreadsheets.sheets.copyTo({
      spreadsheetId,
      sheetId: inventorySheet.properties!.sheetId!,
      requestBody: { destinationSpreadsheetId: spreadsheetId },
    })
  );

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
