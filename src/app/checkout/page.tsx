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

function ItemPhoto({ url, size = "h-20 w-20" }: { url: string; size?: string }) {
  if (!url) return null;
  return (
    <img
      src={url}
      alt="Item photo"
      className={`${size} object-cover rounded-lg border border-amber-700/30`}
    />
  );
}

export default function CheckoutPage() {
  const { items, setItems, loading, error, refetch } = useInventory();
  const [search, setSearch] = useState("");
  const [selling, setSelling] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoAction | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Sell dialog state
  const [sellTarget, setSellTarget] = useState<InventoryItem | null>(null);
  const [salePrice, setSalePrice] = useState("");
  const [salePriceError, setSalePriceError] = useState("");

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

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

  const results = useMemo(() => {
    const q = search.trim();
    if (!q) return [];
    // Exact full item ID match
    const exact = items.filter((i) => i.itemId.toUpperCase() === q.toUpperCase());
    if (exact.length > 0) return exact;
    // Barcode prefix match — barcode encodes only the numeric prefix before the first hyphen
    const prefixMatch = items.filter((i) => i.itemId.startsWith(q + "-") || i.itemId.split("-")[0] === q);
    if (prefixMatch.length > 0) return prefixMatch;
    return fuse.search(q).slice(0, 10).map((r) => r.item);
  }, [items, fuse, search]);

  const doUndo = useCallback(
    async (action: UndoAction) => {
      clearTimeout(action.timer);
      setUndo(null);
      setItems((prev) =>
        prev.map((i) =>
          i.itemId === action.itemId ? { ...i, quantity: action.previousQuantity } : i
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

  function handleSellClick(item: InventoryItem) {
    if (item.quantity <= 0) return;
    setSellTarget(item);
    setSalePrice(item.listPrice > 0 ? item.listPrice.toFixed(2) : "");
    setSalePriceError("");
  }

  async function handleConfirmSell() {
    if (!sellTarget) return;

    const price = parseFloat(salePrice);
    if (!salePrice || isNaN(price) || price < 0) {
      setSalePriceError("Please enter a valid sale price");
      return;
    }

    setSelling(sellTarget.itemId);
    setSyncError(null);
    setSalePriceError("");

    const item = sellTarget;
    const newQty = item.quantity - 1;
    const now = new Date().toISOString();
    const previousQuantity = item.quantity;

    setSellTarget(null);
    if (undo) clearTimeout(undo.timer);

    // Optimistic update
    setItems((prev) =>
      prev.map((i) =>
        i.itemId === item.itemId
          ? { ...i, quantity: newQty, lastSold: now, salePrice: price }
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
          body: JSON.stringify({ quantity: newQty, lastSold: now, salePrice: price }),
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
                body: JSON.stringify({ quantity: newQty, lastSold: now, salePrice: price }),
              }
            );
            if (retry.ok) setSyncError(null);
            else refetch();
          } catch { refetch(); }
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
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-amber-900 border-t-amber-400" />
        <p className="text-gray-500 mt-4">Loading inventory...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <div className="bg-red-950/50 border border-red-800 rounded-2xl p-8 max-w-sm mx-auto">
          <p className="text-4xl mb-3">!</p>
          <p className="text-red-400 font-medium mb-4">{error}</p>
          <button onClick={refetch} className="bg-red-700 text-white px-8 py-3 rounded-xl min-h-[44px] text-lg font-medium shadow-md hover:bg-red-600 transition-colors">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-amber-400 mb-6">Checkout</h1>

      {syncError && (
        <div className="bg-yellow-950/40 border border-yellow-700 text-yellow-400 rounded-xl p-4 mb-4 shadow-sm">{syncError}</div>
      )}

      <div className="relative mb-6">
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Scan barcode or type to search..."
          className="w-full border-2 border-amber-700/40 rounded-2xl px-5 py-4 min-h-[56px] text-xl bg-black text-white placeholder-gray-600 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none shadow-sm transition-all"
          autoFocus
        />
      </div>

      {!search.trim() && (
        <div className="text-center py-12">
          <p className="text-5xl mb-3 opacity-30">&#x1F50D;</p>
          <p className="text-gray-500 text-lg">Scan a barcode or type an item name</p>
        </div>
      )}

      {search.trim() && results.length === 0 && (
        <div className="text-center py-12">
          <p className="text-5xl mb-3 opacity-30">&#x1F6AB;</p>
          <p className="text-gray-500 text-lg">No items found for &quot;{search}&quot;</p>
        </div>
      )}

      <div className="space-y-3">
        {results.map((item) => {
          const outOfStock = item.quantity <= 0;
          const lowStock = item.quantity === 1;
          return (
            <div
              key={item.itemId}
              className={`bg-gray-900 border rounded-2xl p-4 shadow-sm transition-all ${
                outOfStock ? "border-gray-800 opacity-50" : lowStock ? "border-red-800" : "border-amber-700/20 hover:border-amber-700/40 hover:shadow-md"
              }`}
            >
              <div className="flex items-center gap-3">
                {item.photoUrl && <ItemPhoto url={item.photoUrl} size="h-16 w-16" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold text-lg text-gray-100 truncate">{item.name}</p>
                    {lowStock && !outOfStock && (
                      <span className="text-[10px] font-bold bg-red-950 text-red-400 px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0">Last one</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 font-mono truncate">{item.itemId}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full text-xs">{item.size}</span>
                    <span className="bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full text-xs">{item.color}</span>
                    <span className="bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full text-xs">{item.category}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-sm">
                    <span>
                      <span className="text-gray-500">Stock:</span>{" "}
                      <span className={`font-bold ${outOfStock ? "text-gray-600" : lowStock ? "text-red-400" : "text-green-400"}`}>{item.quantity}</span>
                    </span>
                    {item.salePrice > 0 && (
                      <span className="text-gray-500">Last sold: ${item.salePrice.toFixed(2)}</span>
                    )}
                  </div>
                </div>
                {outOfStock ? (
                  <span className="bg-gray-800 text-gray-500 px-4 py-3 rounded-xl text-sm font-semibold min-h-[44px] flex items-center">Out of Stock</span>
                ) : (
                  <button
                    onClick={() => handleSellClick(item)}
                    disabled={selling === item.itemId}
                    className="bg-amber-600 hover:bg-amber-500 text-black px-5 py-3 rounded-xl min-h-[44px] text-lg font-bold disabled:opacity-50 whitespace-nowrap shadow-md hover:shadow-amber-500/20 transition-all"
                  >
                    {selling === item.itemId ? "..." : "Sell"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sell confirmation dialog with photo + sale price */}
      {sellTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-gray-900 border border-amber-700/40 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-xl font-bold text-amber-400 mb-3 text-center">
              {sellTarget.quantity === 1 ? "Last One in Stock!" : "Confirm Sale"}
            </h3>

            {sellTarget.photoUrl && (
              <div className="flex justify-center mb-3">
                <ItemPhoto url={sellTarget.photoUrl} size="h-32 w-32" />
              </div>
            )}

            <p className="text-center font-semibold text-gray-200">{sellTarget.name}</p>
            <p className="text-center text-sm text-gray-500 mb-1">
              {sellTarget.size} &middot; {sellTarget.color} &middot; {sellTarget.category}
            </p>
            {sellTarget.quantity === 1 && (
              <p className="text-center text-sm text-red-400 font-medium mb-2">This is the last one in stock!</p>
            )}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-400 mb-1.5">Sale Price *</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-lg">$</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={salePrice}
                  onChange={(e) => { setSalePrice(e.target.value); setSalePriceError(""); }}
                  placeholder="0.00"
                  autoFocus
                  className="w-full border border-gray-700 bg-black rounded-xl pl-8 pr-4 py-3 min-h-[44px] text-xl text-center text-white placeholder-gray-600 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-colors"
                />
              </div>
              {salePriceError && <p className="text-red-400 text-sm mt-1">{salePriceError}</p>}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSellTarget(null)}
                className="flex-1 bg-gray-800 text-gray-300 py-3 rounded-xl min-h-[44px] text-lg font-medium hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSell}
                className="flex-1 bg-amber-600 hover:bg-amber-500 text-black py-3 rounded-xl min-h-[44px] text-lg font-bold shadow-md hover:shadow-amber-500/20 transition-all"
              >
                Sell
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undo toast */}
      {undo && (
        <div className="fixed bottom-6 left-4 right-4 max-w-md mx-auto bg-black border border-amber-700/40 text-white rounded-2xl p-4 flex items-center justify-between shadow-2xl z-50">
          <span className="text-sm text-amber-300">&#10003; Item marked as sold</span>
          <button onClick={() => doUndo(undo)} className="bg-amber-600 text-black px-5 py-2 rounded-xl min-h-[44px] font-bold hover:bg-amber-500 transition-colors">
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
