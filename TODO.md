# Indian Clothing Inventory System — TODO

## Setup
- [x] Initialize Next.js project with TypeScript, Tailwind CSS
- [x] Install dependencies: googleapis, fuse.js, jsbarcode
- [x] Create .env.example and .gitignore
- [x] Create project directory structure

## Google Sheets Integration
- [x] Implement Google Service Account authentication
- [x] Implement Sheets CRUD operations (read all, append row, update row)
- [x] Add in-memory cache with 60s TTL
- [x] Add retry logic with exponential backoff (max 3 retries)

## API Routes
- [x] GET /api/inventory — return all rows from cache
- [x] POST /api/inventory — append new item, invalidate cache
- [x] PATCH /api/inventory/[itemId] — update quantity/dates, invalidate cache

## UI — Layout & Navigation
- [x] Create root layout with Tailwind and top nav
- [x] Add two-tab navigation: "Add Stock" and "Checkout"
- [x] Ensure 44px minimum touch targets throughout

## UI — Add Stock Screen
- [x] Build adaptive form (Name, Category, Size, Color, Material, Quantity)
- [x] Implement fuzzy search with fuse.js as user types
- [x] Show similar-item match cards with "Restock This" button
- [x] Implement restock flow (increment quantity, update Last Restocked)
- [x] Implement new item flow with slug generation and collision check
- [x] Generate barcode with JsBarcode (Code128)
- [x] Add print label button with @media print stylesheet
- [x] Add loading states, error states, and optimistic updates

## UI — Checkout Screen
- [x] Build search input (auto-focused for barcode scanner)
- [x] Implement two-tier search: exact Item ID match, then fuzzy search
- [x] Display result cards with "Mark as Sold" button
- [x] Handle last-item confirmation dialog
- [x] Handle out-of-stock state (greyed out, disabled)
- [x] Implement 5-second undo toast after each sale
- [x] Add loading states, error states, and optimistic updates

## Documentation
- [x] Write README.md with setup instructions
