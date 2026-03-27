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
  const [restockTarget, setRestockTarget] = useState<InventoryItem | null>(null);
  const [restockQty, setRestockQty] = useState(1);
  const [restocking, setRestocking] = useState(false);

  const barcodeRef = useRef<SVGSVGElement>(null);

  // Fuse.js search
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

  const searchQuery = [name, category, color, size].filter(Boolean).join(" ");
  const matches = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) return [];
    return fuse
      .search(searchQuery)
      .filter((r) => (r.score ?? 1) < 0.7)
      .slice(0, 5);
  }, [fuse, searchQuery]);

  // Render barcode when success item is set
  useEffect(() => {
    if (successItem && barcodeRef.current) {
      import("jsbarcode").then((JsBarcode) => {
        JsBarcode.default(barcodeRef.current!, successItem.itemId, {
          format: "CODE128",
          width: 2,
          height: 60,
          displayValue: false,
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
        body: JSON.stringify({ name, category, size, color, material, quantity }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Failed to add item");
        return;
      }
      setSuccessItem(data);
      setItems((prev) => [...prev, data]);
      // Reset form
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
        // Revert optimistic update
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

  // Show barcode label after successful add
  if (successItem) {
    return (
      <div className="text-center py-8">
        <h2 className="text-2xl font-bold text-green-700 mb-4">
          Item Added Successfully!
        </h2>

        {/* Printable label area */}
        <div
          id="barcode-label"
          className="inline-block border-2 border-dashed border-gray-300 p-4 mb-6"
          style={{ width: "2in", minHeight: "1in" }}
        >
          <svg ref={barcodeRef} />
          <p className="text-xs font-mono mt-1">{successItem.itemId}</p>
          <p className="text-xs mt-0.5">{successItem.name}</p>
        </div>

        <div className="no-print space-y-3">
          <button
            onClick={handlePrint}
            className="block w-full bg-indigo-600 text-white px-6 py-4 rounded-lg min-h-[56px] text-xl font-semibold"
          >
            Print Label
          </button>
          <button
            onClick={() => setSuccessItem(null)}
            className="block w-full bg-gray-200 text-gray-700 px-6 py-4 rounded-lg min-h-[44px] text-lg"
          >
            Add Another Item
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Add Stock</h1>

      {/* Restock panel */}
      {restockTarget && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-800 mb-2">
            Restocking: {restockTarget.name}
          </h3>
          <p className="text-sm text-blue-600 mb-3">
            {restockTarget.itemId} — Currently {restockTarget.quantity} in stock
          </p>
          <div className="flex items-center gap-3 mb-3">
            <label className="text-sm font-medium">Quantity to add:</label>
            <input
              type="number"
              min={1}
              value={restockQty}
              onChange={(e) => setRestockQty(Math.max(1, +e.target.value))}
              className="border rounded-lg px-3 py-2 w-24 min-h-[44px] text-lg"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRestock}
              disabled={restocking}
              className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-lg min-h-[44px] text-lg font-medium disabled:opacity-50"
            >
              {restocking ? "Restocking..." : "Confirm Restock"}
            </button>
            <button
              onClick={() => setRestockTarget(null)}
              className="bg-gray-200 text-gray-700 px-4 py-3 rounded-lg min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {submitError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4">
          {submitError}
        </div>
      )}

      <form onSubmit={handleSubmitNew} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name *
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Kashmir Silk"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 min-h-[44px] text-lg"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 min-h-[44px] text-lg bg-white"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Size *
            </label>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 min-h-[44px] text-lg bg-white"
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
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Color *
          </label>
          <input
            type="text"
            required
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="e.g. Red"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 min-h-[44px] text-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Material (optional)
          </label>
          <input
            type="text"
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            placeholder="e.g. Silk, Cotton"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 min-h-[44px] text-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Quantity
          </label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, +e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 min-h-[44px] text-lg"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-indigo-600 text-white px-6 py-4 rounded-lg min-h-[56px] text-xl font-semibold disabled:opacity-50"
        >
          {submitting ? "Adding..." : "Add New Item"}
        </button>
      </form>

      {/* Fuzzy match suggestions */}
      {matches.length > 0 && !restockTarget && (
        <div className="mt-6">
          <p className="text-sm font-medium text-amber-700 mb-3">
            Similar items already in stock — restock instead?
          </p>
          <div className="space-y-2">
            {matches.map((m) => (
              <div
                key={m.item.itemId}
                className="bg-white border border-amber-200 rounded-lg p-4 flex items-center justify-between"
              >
                <div>
                  <p className="font-medium">{m.item.name}</p>
                  <p className="text-sm text-gray-500">
                    {m.item.itemId} · {m.item.size} · {m.item.color} · Qty:{" "}
                    {m.item.quantity}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRestockTarget(m.item);
                    setRestockQty(1);
                  }}
                  className="bg-amber-500 text-white px-4 py-2 rounded-lg min-h-[44px] text-sm font-medium whitespace-nowrap"
                >
                  Restock This
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
