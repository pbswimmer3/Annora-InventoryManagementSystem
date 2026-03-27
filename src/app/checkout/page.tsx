"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Fuse from "fuse.js";
import { useInventory } from "@/lib/useInventory";
import { InventoryItem } from "@/lib/types";

interface UndoAction {
  itemId: string;
  previousQuantity: number;
  timer: ReturnType<typeof setTimeout>;
}

export default function CheckoutPage() {
  const { items, setItems, loading, error, refetch } = useInventory();
  const [search, setSearch] = useState("");
  const [selling, setSelling] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [confirmItem, setConfirmItem] = useState<InventoryItem | null>(null);
  const [undo, setUndo] = useState<UndoAction | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Auto-focus search input
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Fuse.js for fuzzy search
  const fuse = useMemo(
    () =>
      new Fuse(items, {
        keys: [
          { name: "name", weight: 0.6 },
          { name: "color", weight: 0.2 },
          { name: "category", weight: 0.2 },
        ],
        threshold: 0.4,
        includeScore: true,
      }),
    [items]
  );

  // Two-tier search
  const results = useMemo(() => {
    const q = search.trim();
    if (!q) return [];

    // Tier 1: exact Item ID match
    const exact = items.filter(
      (i) => i.itemId.toUpperCase() === q.toUpperCase()
    );
    if (exact.length > 0) return exact;

    // Tier 2: fuzzy search
    return fuse
      .search(q)
      .slice(0, 10)
      .map((r) => r.item);
  }, [items, fuse, search]);

  const doUndo = useCallback(
    async (action: UndoAction) => {
      clearTimeout(action.timer);
      setUndo(null);

      // Optimistic revert
      setItems((prev) =>
        prev.map((i) =>
          i.itemId === action.itemId
            ? { ...i, quantity: action.previousQuantity }
            : i
        )
      );

      try {
        await fetch(`/api/inventory/${encodeURIComponent(action.itemId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: action.previousQuantity }),
        });
      } catch {
        setSyncError("Undo failed — please refresh");
        refetch();
      }
    },
    [setItems, refetch]
  );

  async function handleSell(item: InventoryItem) {
    if (item.quantity <= 0) return;

    // Last item confirmation
    if (item.quantity === 1) {
      setConfirmItem(item);
      return;
    }

    performSell(item);
  }

  async function performSell(item: InventoryItem) {
    setSelling(item.itemId);
    setSyncError(null);
    setConfirmItem(null);

    const newQty = item.quantity - 1;
    const now = new Date().toISOString();
    const previousQuantity = item.quantity;

    // Clear existing undo
    if (undo) clearTimeout(undo.timer);

    // Optimistic update
    setItems((prev) =>
      prev.map((i) =>
        i.itemId === item.itemId
          ? { ...i, quantity: newQty, lastSold: now }
          : i
      )
    );

    // Set undo timer
    const timer = setTimeout(() => setUndo(null), 5000);
    setUndo({ itemId: item.itemId, previousQuantity, timer });

    try {
      const res = await fetch(
        `/api/inventory/${encodeURIComponent(item.itemId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: newQty, lastSold: now }),
        }
      );
      if (!res.ok) {
        setSyncError("Changes couldn't be saved — retrying...");
        // Auto-retry once
        setTimeout(async () => {
          try {
            const retry = await fetch(
              `/api/inventory/${encodeURIComponent(item.itemId)}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ quantity: newQty, lastSold: now }),
              }
            );
            if (retry.ok) setSyncError(null);
            else refetch();
          } catch {
            refetch();
          }
        }, 2000);
      }
    } catch {
      setSyncError("Changes couldn't be saved — retrying...");
      refetch();
    } finally {
      setSelling(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={refetch}
          className="bg-indigo-600 text-white px-6 py-3 rounded-lg min-h-[44px] text-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Checkout</h1>

      {syncError && (
        <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-lg p-3 mb-4">
          {syncError}
        </div>
      )}

      <input
        ref={searchRef}
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Scan barcode or type to search..."
        className="w-full border-2 border-indigo-300 rounded-lg px-4 py-4 min-h-[56px] text-xl mb-6 focus:border-indigo-500 focus:outline-none"
        autoFocus
      />

      {search.trim() && results.length === 0 && (
        <p className="text-gray-500 text-center py-8">
          No items found for &quot;{search}&quot;
        </p>
      )}

      <div className="space-y-3">
        {results.map((item) => {
          const outOfStock = item.quantity <= 0;
          return (
            <div
              key={item.itemId}
              className={`bg-white border rounded-lg p-4 ${
                outOfStock
                  ? "border-gray-200 opacity-60"
                  : "border-gray-300"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-lg">{item.name}</p>
                  <p className="text-sm text-gray-500 font-mono">
                    {item.itemId}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {item.size} · {item.color} · {item.category}
                  </p>
                  <p className="text-sm mt-1">
                    <span className="font-medium">Qty:</span>{" "}
                    <span
                      className={
                        item.quantity <= 1
                          ? "text-red-600 font-bold"
                          : "text-green-700"
                      }
                    >
                      {item.quantity}
                    </span>
                  </p>
                </div>
                {outOfStock ? (
                  <span className="bg-gray-200 text-gray-500 px-3 py-2 rounded-lg text-sm font-medium min-h-[44px] flex items-center">
                    Out of Stock
                  </span>
                ) : (
                  <button
                    onClick={() => handleSell(item)}
                    disabled={selling === item.itemId}
                    className="bg-red-500 text-white px-5 py-3 rounded-lg min-h-[44px] text-lg font-medium disabled:opacity-50 whitespace-nowrap"
                  >
                    {selling === item.itemId ? "..." : "Mark as Sold"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Last-item confirmation dialog */}
      {confirmItem && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-xl font-bold mb-2">Last One in Stock</h3>
            <p className="text-gray-600 mb-6">
              This is the last <strong>{confirmItem.name}</strong> in stock.
              Mark as sold?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmItem(null)}
                className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg min-h-[44px] text-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => performSell(confirmItem)}
                className="flex-1 bg-red-500 text-white py-3 rounded-lg min-h-[44px] text-lg font-medium"
              >
                Yes, Sell It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undo toast */}
      {undo && (
        <div className="fixed bottom-6 left-4 right-4 max-w-md mx-auto bg-gray-800 text-white rounded-lg p-4 flex items-center justify-between shadow-lg z-50">
          <span>Item sold</span>
          <button
            onClick={() => doUndo(undo)}
            className="bg-white text-gray-800 px-4 py-2 rounded-lg min-h-[44px] font-medium"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
