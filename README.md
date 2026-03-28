# Annora Boutique — Inventory System

A lightweight inventory management system for Annora Boutique, built with Next.js and Google Sheets as the database. Branded in black and gold.

## Features

- **Add Stock** — Add new items or restock existing ones with fuzzy duplicate detection
- **Supplier Price Tracking** — Mandatory supplier cost (in rupees) recorded for every item; encoded into the barcode and hidden from checkout screens
- **Item Photos** — Take a photo of each item from your phone's camera; photos are stored in Google Drive (via OAuth2) and shown during restock and checkout
- **Checkout with Sale Price** — Scan barcodes or search to sell items; every sale requires entering the sale price (in $ USD), with undo support
- **Barcode Labels** — Generate and print Code128 barcode labels sized for 2" x 1" thermal label printers, with on-screen print preview
- **Touch-Friendly** — Designed for tablet/phone use with large tap targets (44px+ minimum)
- **Password Protected** — Simple password gate to keep the site private
- **Activity Log** — Every add, restock, sell, and undo is logged to a "Log" sheet tab with timestamps
- **Daily Backups** — Automatic daily backup of the Inventory sheet via Vercel Cron
- **Annora Branding** — Black and gold theme with the Annora logo throughout

## Tech Stack

- Next.js (App Router) with TypeScript
- Google Sheets as database (via `googleapis` service account)
- Google Drive for item photo storage (via `googleapis` OAuth2 — service accounts have no Drive storage quota)
- Tailwind CSS for styling (black and gold theme)
- JsBarcode for Code128 barcode generation
- Fuse.js for fuzzy search

## Setup

### 1. Create a Google Sheet

1. Create a new Google Sheet
2. Name the first sheet tab `Inventory`
3. Add headers in row 1:

| A | B | C | D | E | F | G | H | I | J | K | L | M |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Item ID | Name | Category | Size | Color | Material | Quantity | Date Added | Last Restocked | Last Sold | Supplier Price | Sale Price | Photo URL |

4. Create a second sheet tab called `Log`
5. Add headers in row 1:

| A | B | C | D |
|---|---|---|---|
| Timestamp | Action | Item ID | Details |

6. Copy the Sheet ID from the URL: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit`

### 2. Create a Google Service Account (for Sheets)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable the **Google Sheets API**
4. Enable the **Google Drive API**
5. Go to **IAM & Admin > Service Accounts**
6. Create a new service account
7. Create a JSON key for this service account — download it
8. Share your Google Sheet with the service account email (the `client_email` field in the JSON key), giving it **Editor** access

### 3. Set Up OAuth2 for Google Drive (for photo uploads)

Service accounts have no Drive storage quota, so photo uploads use OAuth2 with a real Google account. Photos are stored in that account's Drive and count against its 15GB free quota.

1. In Google Cloud Console, go to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth client ID**
3. Choose **Web application** as the type
4. Add `http://localhost:3333` as an **Authorized redirect URI**
5. Copy the **Client ID** and **Client Secret**
6. Configure the **OAuth consent screen** (APIs & Services > OAuth consent screen):
   - Choose **External** user type
   - Fill in the app name (e.g. "Annora-IMS")
   - Add the Google account email as a test user
   - **Publish the app** to make refresh tokens permanent (otherwise they expire after 7 days)
7. Run the setup script to get a refresh token:

```bash
node scripts/get-refresh-token.js <CLIENT_ID> <CLIENT_SECRET>
```

8. A browser window opens — log in with the Google account where you want photos stored and approve access
9. The script prints your `GOOGLE_REFRESH_TOKEN` — copy it

Photos are stored in an `Annora-Inventory-Photos` folder automatically created in that Google account's Drive.

### 4. Configure Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Set the values:

- `GOOGLE_SHEET_ID` — the Sheet ID from step 1
- `GOOGLE_SERVICE_ACCOUNT_KEY` — either:
  - The entire JSON key file contents as a single line, OR
  - The JSON key base64-encoded: `cat key.json | base64`
- `GOOGLE_CLIENT_ID` — OAuth2 Client ID from step 3
- `GOOGLE_CLIENT_SECRET` — OAuth2 Client Secret from step 3
- `GOOGLE_REFRESH_TOKEN` — the refresh token from the setup script
- `APP_PASSWORD` — the password users must enter to access the site (if not set, no password is required)
- `CRON_SECRET` — a random string to secure the backup cron endpoint (generate with `openssl rand -hex 16`)

### 5. Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be prompted for the password, then redirected to Add Stock.

### 6. Deploy to Vercel

1. Push to GitHub
2. Import the repo in [Vercel](https://vercel.com)
3. Add all environment variables in the Vercel project settings:
   - `GOOGLE_SHEET_ID`
   - `GOOGLE_SERVICE_ACCOUNT_KEY`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REFRESH_TOKEN`
   - `APP_PASSWORD`
   - `CRON_SECRET`
4. Deploy

The daily backup cron job is configured in `vercel.json` and runs automatically at 6:00 AM UTC every day. It creates a new sheet tab named `Backup-YYYY-MM-DD` with a full copy of the Inventory sheet. You'll see these backup tabs accumulate in your Google Sheet over time.

## How It Works

### Add Stock Flow

1. Fill in the item details: Name, Category, Size, Color, Material, Quantity, and **Supplier Price** (in rupees, mandatory)
2. Optionally tap **"Take Photo"** to snap a picture of the item with your phone's camera
3. As you type, the app searches existing inventory for similar items and shows them below the form
4. If a match exists, tap **"Restock This"** to add more quantity to the existing item instead of creating a duplicate. A confirmation dialog shows the item's photo (if available) before restocking.
5. If no match, tap **"Add New Item"** — the photo uploads to Google Drive, the item is saved to the sheet, and a printable barcode label is generated
6. A **Print Preview** shows the barcode at actual 2" x 1" size. Tap **"Print Label"** to print.

### Checkout / Sell Flow

1. Scan a barcode with a USB scanner, or type an item name into the search field
2. The app first tries an exact Item ID match, then falls back to fuzzy search
3. Results show item details including photo thumbnail, stock count, and last sale price ($)
4. Tap **"Sell"** — a confirmation dialog appears showing:
   - The item's photo (if available)
   - Item details and current stock
   - A **mandatory "Sale Price" field** (in $ USD) — must be filled before the sale goes through
5. After confirming, quantity decrements and a 5-second **Undo** toast appears at the bottom

### Item ID & Barcode Encoding

Each item ID is generated with the supplier price encoded into it:

```
[3 random digits][rounded supplier price][3 random digits]-COLOR-NAME-CATEGORY-SIZE
```

For example, a red Kashmir silk sari (size MD) with supplier price 1234 might generate:
`7891234456-RED-KASHMIR-SILK-SARI-MD`

The supplier price is **not visible** on checkout screens — it can only be decoded by someone who knows the encoding format (strip the first 3 and last 3 digits of the leading number segment).

### Item Photos

- Photos are uploaded to **Google Drive** using OAuth2 with a real Google account (service accounts have no storage quota)
- A folder called `Annora-Inventory-Photos` is automatically created in the authenticated user's Drive
- Each photo is made publicly viewable so it can be displayed in the app
- Photos appear in: restock suggestion cards, restock confirmation dialog, checkout search results, and sell confirmation dialog
- On mobile, the "Take Photo" button opens the device camera directly (via `capture="environment"`)
- Max file size: 5MB per photo

## Activity Log

Every action is automatically logged to the `Log` sheet tab in your Google Sheet:

| Action | When it's logged |
|--------|-----------------|
| `ADD` | New item added to inventory (includes supplier cost) |
| `RESTOCK` | Existing item quantity increased |
| `SELL` | Item marked as sold (includes sale price) |
| `UNDO_SELL` | Sale undone (quantity restored) |
| `BACKUP` | Daily backup created |

Each log entry includes a timestamp, the Item ID, and a description of what changed.

## Using a USB Barcode Scanner

A USB barcode scanner works exactly like a keyboard — when you scan a barcode, the scanner **types the barcode text into whatever field is focused** and then presses Enter.

**How it works with this app:**

1. Go to the **Checkout** tab — the search field is automatically focused
2. Point the USB barcode scanner at the item's barcode label and scan it
3. The scanner types the Item ID into the search field
4. The app instantly finds and displays the matching item
5. Tap **"Sell"**, enter the sale price, and confirm

**No special software or drivers are needed.** Just plug the USB scanner into the laptop. Most USB barcode scanners work out of the box on Windows, Mac, and Chromebooks.

**Recommended scanners:** Any USB barcode scanner that supports Code128 format (nearly all of them do). Budget options ($15-25) from brands like Tera, Netum, or Inateck work great.

## Printer Setup (Thermal Label Printer)

**Recommended printer:** Any USB thermal label printer (e.g. DYMO LabelWriter, MUNBYN, Rollo, Phomemo)

**Labels:** 2" x 1" direct thermal barcode labels (no ink needed — the printer heats the label to create the image)

**Setup:**

1. Plug the USB thermal printer into the laptop
2. Install the printer's driver (usually comes on a CD or download from manufacturer's website)
3. The printer will appear in your system's printer list

**Printing labels:**

1. Add a new item on the **Add Stock** tab
2. After adding, you'll see a **Print Preview** showing the barcode at actual 2" x 1" size
3. Click **"Print Label"**
4. In the browser's print dialog, select your thermal printer from the printer list
5. The browser remembers your printer selection for future prints
6. Print and stick the label on the item's tag

**Troubleshooting:**

- **Label is clipped or misaligned:** Open your thermal printer's preferences (Control Panel > Devices and Printers > right-click printer > Printing Preferences) and set the paper size to **2" x 1"** (or 51mm x 25mm)
- **Blank label prints:** Make sure the label is loaded shiny-side facing the print head (thermal labels only print on one side)
- **Print dialog shows wrong page size:** The app sets `@page { size: 2in 1in }` automatically, but some browsers need the printer preferences set first to respect it

## Project Structure

```
src/
├── app/
│   ├── layout.tsx            # Root layout with auth gate + nav (black/gold theme)
│   ├── page.tsx              # Redirects to /add-stock
│   ├── globals.css           # Tailwind + print styles (@page 2x1 for labels)
│   ├── add-stock/page.tsx    # Add/restock items with photo capture
│   ├── checkout/page.tsx     # Sell items with sale price dialog
│   └── api/
│       ├── auth/route.ts     # Password verification
│       ├── backup/route.ts   # Daily backup (Vercel Cron)
│       ├── upload/route.ts   # Photo upload to Google Drive (OAuth2)
│       └── inventory/
│           ├── route.ts      # GET (list) + POST (create with encoded supplier price)
│           └── [itemId]/route.ts  # PATCH (update qty/dates/sale price)
├── components/
│   ├── AuthGate.tsx          # Password gate wrapper (black/gold login)
│   └── Nav.tsx               # Top navigation with Annora logo
├── lib/
│   ├── types.ts              # TypeScript types & constants (13 columns)
│   ├── slug.ts               # Item ID slug generator (encodes supplier price)
│   ├── sheets.ts             # Google Sheets (service account) + Drive (OAuth2), cache, logging, backup
│   └── useInventory.ts       # Client-side data hook
├── public/
│   └── annora-logo.jpg       # Annora brand logo
└── scripts/
    └── get-refresh-token.js  # One-time OAuth2 setup script
```
