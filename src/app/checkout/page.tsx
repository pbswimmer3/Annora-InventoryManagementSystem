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

    if (undo) clearTimeout(undo.timer);

    // Optimistic update
    setItems((prev) =>
      prev.map((i) =>
        i.itemId === item.itemId
          ? { ...i, quantity: newQty, lastSold: now }
          : i
      )
    );

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
      <div className="flex flex-col items-center justify-center py-16">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-200 border-t-purple-600" />
        <p className="text-gray-500 mt-4">Loading inventory...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 max-w-sm mx-auto">
          <p className="text-4xl mb-3">!</p>
          <p className="text-red-700 font-medium mb-4">{error}</p>
          <button
            onClick={refetch}
            className="bg-red-600 text-white px-8 py-3 rounded-xl min-h-[44px] text-lg font-medium shadow-md hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Checkout</h1>

      {syncError && (
        <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-xl p-4 mb-4 shadow-sm">
          {syncError}
        </div>
      )}

      <div className="relative mb-6">
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Scan barcode or type to search..."
          className="w-full border-2 border-purple-200 rounded-2xl px-5 py-4 min-h-[56px] text-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-100 focus:outline-none bg-white shadow-sm transition-all"
          autoFocus
        />
      </div>

      {!search.trim() && (
        <div className="text-center py-12">
          <p className="text-5xl mb-3 opacity-40">&#x1F50D;</p>
          <p className="text-gray-400 text-lg">
            Scan a barcode or type an item name
          </p>
        </div>
      )}

      {search.trim() && results.length === 0 && (
        <div className="text-center py-12">
          <p className="text-5xl mb-3 opacity-40">&#x1F6AB;</p>
          <p className="text-gray-400 text-lg">
            No items found for &quot;{search}&quot;
          </p>
        </div>
      )}

      <div className="space-y-3">
        {results.map((item) => {
          const outOfStock = item.quantity <= 0;
          const lowStock = item.quantity === 1;
          return (
            <div
              key={item.itemId}
              className={`bg-white border rounded-2xl p-4 shadow-sm transition-all ${
                outOfStock
                  ? "border-gray-200 opacity-50"
                  : lowStock
                  ? "border-red-200"
                  : "border-gray-200 hover:border-gray-300 hover:shadow-md"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold text-lg text-gray-800 truncate">
                      {item.name}
                    </p>
                    {lowStock && !outOfStock && (
                      <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0">
                        Last one
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 font-mono truncate">
                    {item.itemId}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 text-sm text-gray-500">
                    <span className="bg-gray-100 px-2 py-0.5 rounded-full text-xs">
                      {item.size}
                    </span>
                    <span className="bg-gray-100 px-2 py-0.5 rounded-full text-xs">
                      {item.color}
                    </span>
                    <span className="bg-gray-100 px-2 py-0.5 rounded-full text-xs">
                      {item.category}
                    </span>
                  </div>
                  <p className="text-sm mt-1.5">
                    <span className="text-gray-500">In stock:</span>{" "}
                    <span
                      className={`font-bold ${
                        outOfStock
                          ? "text-gray-400"
                          : lowStock
                          ? "text-red-600"
                          : "text-green-600"
                      }`}
                    >
                      {item.quantity}
                    </span>
                  </p>
                </div>
                {outOfStock ? (
                  <span className="bg-gray-100 text-gray-400 px-4 py-3 rounded-xl text-sm font-semibold min-h-[44px] flex items-center">
                    Out of Stock
                  </span>
                ) : (
                  <button
                    onClick={() => handleSell(item)}
                    disabled={selling === item.itemId}
                    className="bg-gradient-to-r from-red-500 to-pink-500 text-white px-5 py-3 rounded-xl min-h-[44px] text-lg font-semibold disabled:opacity-50 whitespace-nowrap shadow-md hover:shadow-lg hover:from-red-600 hover:to-pink-600 transition-all"
                  >
                    {selling === item.itemId ? "..." : "Sell"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Last-item confirmation dialog */}
      {confirmItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="text-center mb-4">
              <p className="text-4xl mb-2">&#9888;&#65039;</p>
              <h3 className="text-xl font-bold text-gray-800">
                Last One in Stock
              </h3>
            </div>
            <p className="text-gray-600 text-center mb-6">
              This is the last <strong>{confirmItem.name}</strong> in stock.
              Mark as sold?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmItem(null)}
                className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl min-h-[44px] text-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => performSell(confirmItem)}
                className="flex-1 bg-gradient-to-r from-red-500 to-pink-500 text-white py-3 rounded-xl min-h-[44px] text-lg font-semibold shadow-md hover:from-red-600 hover:to-pink-600 transition-all"
              >
                Yes, Sell It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undo toast */}
      {undo && (
        <div className="fixed bottom-6 left-4 right-4 max-w-md mx-auto bg-gray-900 text-white rounded-2xl p-4 flex items-center justify-between shadow-2xl z-50">
          <span className="text-sm">
            &#10003; Item marked as sold
          </span>
          <button
            onClick={() => doUndo(undo)}
            className="bg-white text-gray-900 px-5 py-2 rounded-xl min-h-[44px] font-semibold hover:bg-gray-100 transition-colors"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
