# Indian Clothing Boutique — Inventory System

A lightweight inventory management system for a small Indian clothing boutique, built with Next.js and Google Sheets as the database.

## Features

- **Add Stock** — Add new items or restock existing ones with fuzzy duplicate detection
- **Checkout** — Scan barcodes or search to mark items as sold, with undo support
- **Barcode Labels** — Generate and print Code128 barcode labels for each item
- **Touch-Friendly** — Designed for tablet use with large tap targets

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

4. Copy the Sheet ID from the URL: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit`

### 2. Create a Google Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable the **Google Sheets API**
4. Go to **IAM & Admin → Service Accounts**
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

### 4. Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to the Add Stock page.

### 5. Deploy to Vercel

1. Push to GitHub
2. Import the repo in [Vercel](https://vercel.com)
3. Add `GOOGLE_SHEET_ID` and `GOOGLE_SERVICE_ACCOUNT_KEY` as environment variables in the Vercel project settings
4. Deploy

## Project Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout with nav
│   ├── page.tsx            # Redirects to /add-stock
│   ├── globals.css         # Tailwind + print styles
│   ├── add-stock/page.tsx  # Add/restock items
│   ├── checkout/page.tsx   # Sell items
│   └── api/inventory/
│       ├── route.ts        # GET (list) + POST (create)
│       └── [itemId]/route.ts  # PATCH (update)
├── components/
│   └── Nav.tsx             # Top navigation tabs
└── lib/
    ├── types.ts            # TypeScript types & constants
    ├── slug.ts             # Item ID slug generator
    ├── sheets.ts           # Google Sheets client + cache
    └── useInventory.ts     # Client-side data hook
```
