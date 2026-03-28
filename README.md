# Indian Clothing Boutique — Inventory System

A lightweight inventory management system for a small Indian clothing boutique, built with Next.js and Google Sheets as the database.

## Features

- **Add Stock** — Add new items or restock existing ones with fuzzy duplicate detection
- **Checkout** — Scan barcodes or search to mark items as sold, with undo support
- **Barcode Labels** — Generate and print Code128 barcode labels for each item
- **Touch-Friendly** — Designed for tablet use with large tap targets
- **Password Protected** — Simple password gate to keep the site private
- **Activity Log** — Every add, restock, sell, and undo is logged to a "Log" sheet tab
- **Daily Backups** — Automatic daily backup of the Inventory sheet (via Vercel Cron)

## Tech Stack

- Next.js (App Router) with TypeScript
- Google Sheets as database (via `googleapis`)
- Tailwind CSS for styling
- JsBarcode for Code128 barcode generation
- Fuse.js for fuzzy search

## Setup

### 1. Create a Google Sheet

1. Create a new Google Sheet
2. Name the first sheet tab `Inventory`
3. Add headers in row 1:

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| Item ID | Name | Category | Size | Color | Material | Quantity | Date Added | Last Restocked | Last Sold |

4. Create a second sheet tab called `Log`
5. Add headers in row 1:

| A | B | C | D |
|---|---|---|---|
| Timestamp | Action | Item ID | Details |

6. Copy the Sheet ID from the URL: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit`

### 2. Create a Google Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable the **Google Sheets API**
4. Go to **IAM & Admin > Service Accounts**
5. Create a new service account
6. Create a JSON key for this service account — download it
7. Share your Google Sheet with the service account email (the `client_email` field in the JSON key), giving it **Editor** access

### 3. Configure Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Set the values:

- `GOOGLE_SHEET_ID` — the Sheet ID from step 1
- `GOOGLE_SERVICE_ACCOUNT_KEY` — either:
  - The entire JSON key file contents as a single line, OR
  - The JSON key base64-encoded: `cat key.json | base64`
- `APP_PASSWORD` — the password users must enter to access the site (if not set, no password is required)
- `CRON_SECRET` — a random string to secure the backup cron endpoint (generate with `openssl rand -hex 16`)

### 4. Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be prompted for the password, then redirected to Add Stock.

### 5. Deploy to Vercel

1. Push to GitHub
2. Import the repo in [Vercel](https://vercel.com)
3. Add all four environment variables in the Vercel project settings:
   - `GOOGLE_SHEET_ID`
   - `GOOGLE_SERVICE_ACCOUNT_KEY`
   - `APP_PASSWORD`
   - `CRON_SECRET`
4. Deploy

The daily backup cron job is configured in `vercel.json` and runs automatically at 6:00 AM UTC every day. It creates a new sheet tab named `Backup-YYYY-MM-DD` with a full copy of the Inventory sheet. You'll see these backup tabs accumulate in your Google Sheet over time.

## Activity Log

Every action is automatically logged to the `Log` sheet tab in your Google Sheet:

| Action | When it's logged |
|--------|-----------------|
| `ADD` | New item added to inventory |
| `RESTOCK` | Existing item quantity increased |
| `SELL` | Item marked as sold (quantity decremented) |
| `UNDO_SELL` | Sale undone (quantity restored) |
| `BACKUP` | Daily backup created |

Each log entry includes a timestamp, the Item ID, and a description of what changed.

## Using a USB Barcode Scanner

A USB barcode scanner works exactly like a keyboard — when you scan a barcode, the scanner **types the barcode text into whatever field is focused** and then presses Enter.

**How it works with this app:**

1. Go to the **Checkout** tab — the search field is automatically focused
2. Point the USB barcode scanner at the item's barcode label and scan it
3. The scanner types the Item ID (e.g. `RED-KASHMIR-SILK-SARI-MD`) into the search field
4. The app instantly finds and displays the matching item
5. Tap **"Sell"** to mark it as sold

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
│   ├── layout.tsx            # Root layout with auth gate + nav
│   ├── page.tsx              # Redirects to /add-stock
│   ├── globals.css           # Tailwind + print styles
│   ├── add-stock/page.tsx    # Add/restock items
│   ├── checkout/page.tsx     # Sell items
│   └── api/
│       ├── auth/route.ts     # Password verification
│       ├── backup/route.ts   # Daily backup (Vercel Cron)
│       └── inventory/
│           ├── route.ts      # GET (list) + POST (create)
│           └── [itemId]/route.ts  # PATCH (update)
├── components/
│   ├── AuthGate.tsx          # Password gate wrapper
│   └── Nav.tsx               # Top navigation tabs
└── lib/
    ├── types.ts              # TypeScript types & constants
    ├── slug.ts               # Item ID slug generator
    ├── sheets.ts             # Google Sheets client + cache + logging + backup
    └── useInventory.ts       # Client-side data hook
```
