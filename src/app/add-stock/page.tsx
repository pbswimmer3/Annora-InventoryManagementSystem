"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Fuse from "fuse.js";
import { useInventory } from "@/lib/useInventory";
import { InventoryItem, CATEGORIES, SIZES } from "@/lib/types";

export default function AddStockPage() {
  const { items, setItems, loading, error, refetch } = useInventory();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [size, setSize] = useState<string>("MD");
  const [color, setColor] = useState("");
  const [material, setMaterial] = useState("");
  const [quantity, setQuantity] = useState(1);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successItem, setSuccessItem] = useState<InventoryItem | null>(null);

  // Restock state
  const [restockTarget, setRestockTarget] = useState<InventoryItem | null>(
    null
  );
  const [restockQty, setRestockQty] = useState(1);
  const [restocking, setRestocking] = useState(false);

  const barcodeRef = useRef<SVGSVGElement>(null);

  // Fuse.js search — search on individual fields for better matching
  const fuse = useMemo(
    () =>
      new Fuse(items, {
        keys: [
          { name: "name", weight: 0.4 },
          { name: "category", weight: 0.2 },
          { name: "color", weight: 0.2 },
          { name: "size", weight: 0.2 },
        ],
        threshold: 0.4,
        includeScore: true,
      }),
    [items]
  );

  // Search driven by NAME field only (category/size always have defaults so they'd pollute results)
  // Also match on color if provided, but name is the primary trigger
  const matches = useMemo(() => {
    const q = name.trim();
    if (q.length < 2) return [];

    // Build search string from user-typed fields only (skip defaults)
    const searchParts = [q];
    if (color.trim()) searchParts.push(color.trim());
    const searchStr = searchParts.join(" ");

    return fuse
      .search(searchStr)
      .filter((r) => (r.score ?? 1) < 0.7)
      .slice(0, 5);
  }, [fuse, name, color]);

  // Render barcode when success item is set
  useEffect(() => {
    if (successItem && barcodeRef.current) {
      import("jsbarcode").then((JsBarcode) => {
        JsBarcode.default(barcodeRef.current!, successItem.itemId, {
          format: "CODE128",
          width: 1.5,
          height: 50,
          displayValue: false,
          margin: 4,
        });
      });
    }
  }, [successItem]);

  async function handleSubmitNew(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          category,
          size,
          color,
          material,
          quantity,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Failed to add item");
        return;
      }
      setSuccessItem(data);
      setItems((prev) => [...prev, data]);
      setName("");
      setColor("");
      setMaterial("");
      setQuantity(1);
    } catch {
      setSubmitError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRestock() {
    if (!restockTarget) return;
    setRestocking(true);
    setSubmitError(null);

    const newQty = restockTarget.quantity + restockQty;
    const now = new Date().toISOString();

    // Optimistic update
    setItems((prev) =>
      prev.map((i) =>
        i.itemId === restockTarget.itemId
          ? { ...i, quantity: newQty, lastRestocked: now }
          : i
      )
    );

    try {
      const res = await fetch(
        `/api/inventory/${encodeURIComponent(restockTarget.itemId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: newQty, lastRestocked: now }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        setSubmitError(data.error || "Failed to restock");
        refetch();
        return;
      }
      setRestockTarget(null);
      setRestockQty(1);
      setSuccessItem(null);
    } catch {
      setSubmitError("Network error — please try again");
      refetch();
    } finally {
      setRestocking(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-orange-200 border-t-orange-600" />
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

  // Show barcode label after successful add
  if (successItem) {
    return (
      <div>
        {/* This section is visible on screen */}
        <div className="no-print text-center py-8">
          <div className="bg-green-50 border border-green-200 rounded-2xl p-8 max-w-sm mx-auto mb-6">
            <p className="text-4xl mb-2">&#10003;</p>
            <h2 className="text-2xl font-bold text-green-700 mb-1">
              Item Added!
            </h2>
            <p className="text-green-600">{successItem.name}</p>
          </div>
        </div>

        {/* Barcode label — visible both on screen and in print */}
        <div
          id="barcode-label"
          className="mx-auto border-2 border-dashed border-gray-300 rounded-lg p-4 bg-white text-center"
          style={{ width: "2in", minHeight: "1in" }}
        >
          <svg
            ref={barcodeRef}
            className="block mx-auto"
            style={{ maxWidth: "100%", height: "auto" }}
          />
          <p className="text-[10px] font-mono mt-1 leading-tight break-all">
            {successItem.itemId}
          </p>
          <p className="text-[9px] mt-0.5 text-gray-600 leading-tight">
            {successItem.name}
          </p>
        </div>

        <div className="no-print space-y-3 max-w-sm mx-auto mt-6">
          <button
            onClick={handlePrint}
            className="block w-full bg-gradient-to-r from-orange-500 to-pink-500 text-white px-6 py-4 rounded-xl min-h-[56px] text-xl font-semibold shadow-lg hover:shadow-xl transition-shadow"
          >
            Print Label
          </button>
          <button
            onClick={() => setSuccessItem(null)}
            className="block w-full bg-white text-gray-700 border border-gray-300 px-6 py-4 rounded-xl min-h-[44px] text-lg hover:bg-gray-50 transition-colors"
          >
            Add Another Item
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Add Stock</h1>

      {/* Restock panel */}
      {restockTarget && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-5 mb-6 shadow-sm">
          <h3 className="font-bold text-blue-800 text-lg mb-1">
            Restocking: {restockTarget.name}
          </h3>
          <p className="text-sm text-blue-600 mb-4">
            {restockTarget.itemId} &middot; {restockTarget.size} &middot;{" "}
            {restockTarget.color} &middot; Currently{" "}
            <strong>{restockTarget.quantity}</strong> in stock
          </p>
          <div className="flex items-center gap-3 mb-4">
            <label className="text-sm font-medium text-blue-800">
              Quantity to add:
            </label>
            <input
              type="number"
              min={1}
              value={restockQty}
              onChange={(e) => setRestockQty(Math.max(1, +e.target.value))}
              className="border border-blue-300 rounded-xl px-3 py-2 w-24 min-h-[44px] text-lg text-center bg-white"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRestock}
              disabled={restocking}
              className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-xl min-h-[44px] text-lg font-medium disabled:opacity-50 shadow-md hover:bg-blue-700 transition-colors"
            >
              {restocking ? "Restocking..." : "Confirm Restock"}
            </button>
            <button
              onClick={() => setRestockTarget(null)}
              className="bg-white text-gray-600 border border-gray-300 px-4 py-3 rounded-xl min-h-[44px] hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {submitError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-4 shadow-sm">
          {submitError}
        </div>
      )}

      <form
        onSubmit={handleSubmitNew}
        className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4"
      >
        <div>
          <label className="block text-sm font-semibold text-gray-600 mb-1.5">
            Name *
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Kashmir Silk"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 min-h-[44px] text-lg focus:border-orange-400 focus:ring-2 focus:ring-orange-100 focus:outline-none transition-colors"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1.5">
              Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 min-h-[44px] text-lg bg-white focus:border-orange-400 focus:ring-2 focus:ring-orange-100 focus:outline-none transition-colors"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1.5">
              Size *
            </label>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 min-h-[44px] text-lg bg-white focus:border-orange-400 focus:ring-2 focus:ring-orange-100 focus:outline-none transition-colors"
            >
              {SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-600 mb-1.5">
            Color *
          </label>
          <input
            type="text"
            required
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="e.g. Red"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 min-h-[44px] text-lg focus:border-orange-400 focus:ring-2 focus:ring-orange-100 focus:outline-none transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-600 mb-1.5">
            Material <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            placeholder="e.g. Silk, Cotton"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 min-h-[44px] text-lg focus:border-orange-400 focus:ring-2 focus:ring-orange-100 focus:outline-none transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-600 mb-1.5">
            Quantity
          </label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, +e.target.value))}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 min-h-[44px] text-lg focus:border-orange-400 focus:ring-2 focus:ring-orange-100 focus:outline-none transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-gradient-to-r from-orange-500 to-pink-500 text-white px-6 py-4 rounded-xl min-h-[56px] text-xl font-semibold disabled:opacity-50 shadow-lg hover:shadow-xl hover:from-orange-600 hover:to-pink-600 transition-all"
        >
          {submitting ? "Adding..." : "Add New Item"}
        </button>
      </form>

      {/* Fuzzy match suggestions — shown as user types name */}
      {matches.length > 0 && !restockTarget && (
        <div className="mt-6">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm">
            <p className="text-sm font-semibold text-amber-800 mb-3">
              Similar items already in stock — restock instead?
            </p>
            <div className="space-y-2">
              {matches.map((m) => (
                <div
                  key={m.item.itemId}
                  className="bg-white border border-amber-100 rounded-xl p-4 flex items-center justify-between shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-800">
                      {m.item.name}
                    </p>
                    <p className="text-sm text-gray-500 truncate">
                      {m.item.size} &middot; {m.item.color} &middot;{" "}
                      {m.item.category}
                    </p>
                    <p className="text-sm text-gray-500">
                      Qty: <strong>{m.item.quantity}</strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRestockTarget(m.item);
                      setRestockQty(1);
                    }}
                    className="ml-3 bg-amber-500 text-white px-4 py-2.5 rounded-xl min-h-[44px] text-sm font-semibold whitespace-nowrap shadow-md hover:bg-amber-600 transition-colors"
                  >
                    Restock This
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
