"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Fuse from "fuse.js";
import { useInventory } from "@/lib/useInventory";
import { InventoryItem, CATEGORIES, SIZES } from "@/lib/types";

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "..." : str;
}

function BarcodeLabel({
  item,
  barcodeRef,
}: {
  item: InventoryItem;
  barcodeRef: React.RefObject<SVGSVGElement | null>;
}) {
  return (
    <div
      style={{
        width: "2.2in",
        height: "1.2in",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0.04in 0.08in",
        boxSizing: "border-box",
        gap: "1px",
        background: "white",
      }}
    >
      {item.listPrice > 0 && (
        <p className="label-list-price" style={{ fontSize: "14pt", fontWeight: "bold", textAlign: "center", color: "black", lineHeight: 1, letterSpacing: "0.02em" }}>
          ${item.listPrice.toFixed(2)}
        </p>
      )}
      <svg ref={barcodeRef} />
      <p className="label-item-name" style={{ fontSize: "7pt", textAlign: "center", lineHeight: 1.1, color: "black" }}>
        {item.category}
      </p>
      <p className="label-item-id" style={{ fontFamily: "monospace", fontSize: "6pt", textAlign: "center", lineHeight: 1.1, color: "black" }}>
        {item.itemId.split('-')[0]}-{item.color}-{item.size}
      </p>
    </div>
  );
}

/** Convert the barcode SVG element to a PNG data-URL via an offscreen canvas. */
function svgToDataUrl(svgEl: SVGSVGElement): Promise<string> {
  return new Promise((resolve) => {
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    // Ensure explicit width/height for the serialised SVG so the Image has dimensions
    const w = svgEl.getAttribute("width") || String(svgEl.getBoundingClientRect().width);
    const h = svgEl.getAttribute("height") || String(svgEl.getBoundingClientRect().height);
    clone.setAttribute("width", w);
    clone.setAttribute("height", h);
    const xml = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      // 2× for sharper print output
      canvas.width = Number(w) * 2;
      canvas.height = Number(h) * 2;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.src = url;
  });
}

/**
 * Generate a PDF at exactly the label size and open it in a new tab.
 * iOS prints PDFs with NO headers / footers / pagination — solving all
 * the Safari AirPrint issues that CSS @page cannot fix.
 */
async function printLabel(item: InventoryItem, barcodeSvgEl: SVGSVGElement | null) {
  const { jsPDF } = await import("jspdf");

  // Page = 2.2 × 1.2 inches.  jsPDF uses "in" as the unit.
  const pw = 2.2;
  const ph = 1.2;
  const doc = new jsPDF({ orientation: "landscape", unit: "in", format: [ph, pw] });

  // ---- Price ----
  let y = 0.12;
  if (item.listPrice > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(`$${item.listPrice.toFixed(2)}`, pw / 2, y, { align: "center" });
    y += 0.17;
  }

  // ---- Barcode image ----
  if (barcodeSvgEl) {
    const dataUrl = await svgToDataUrl(barcodeSvgEl);
    // Barcode image: centred, max width with small side margins
    const barcodeW = 1.9;
    const barcodeH = 0.5;
    const bx = (pw - barcodeW) / 2;
    doc.addImage(dataUrl, "PNG", bx, y, barcodeW, barcodeH);
    y += barcodeH + 0.04;
  }

  // ---- Category ----
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(item.category, pw / 2, y, { align: "center" });
  y += 0.09;

  // ---- Item ID line ----
  doc.setFont("courier", "normal");
  doc.setFontSize(6);
  const idLine = `${item.itemId.split("-")[0]}-${item.color}-${item.size}`;
  doc.text(idLine, pw / 2, y, { align: "center" });

  // Open the PDF in a new tab — iOS prints PDFs cleanly (no headers/footers)
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
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

export default function AddStockPage() {
  const { items, setItems, loading, error, refetch } = useInventory();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [size, setSize] = useState<string>("MD");
  const [color, setColor] = useState("");
  const [material, setMaterial] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [supplierPrice, setSupplierPrice] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successItem, setSuccessItem] = useState<InventoryItem | null>(null);

  const [restockTarget, setRestockTarget] = useState<InventoryItem | null>(null);
  const [restockQty, setRestockQty] = useState(1);
  const [restocking, setRestocking] = useState(false);
  const [restockConfirm, setRestockConfirm] = useState(false);

  const previewBarcodeRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const matches = useMemo(() => {
    const q = name.trim();
    if (q.length < 2) return [];
    const searchParts = [q];
    if (color.trim()) searchParts.push(color.trim());
    const searchStr = searchParts.join(" ");
    return fuse
      .search(searchStr)
      .filter((r) => (r.score ?? 1) < 0.7)
      .slice(0, 5);
  }, [fuse, name, color]);

  // Render barcodes
  useEffect(() => {
    if (!successItem) return;
    // Encode only the short numeric price prefix (e.g. "3956000181") — not the full 40+ char item ID.
    // The full ID is too long for scannable bars on a 2"x1" label; the prefix is unique per item.
    const barcodeValue = successItem.itemId.split('-')[0];
    import("jsbarcode").then((JsBarcode) => {
      const config = { format: "CODE128", width: 3, height: 50, displayValue: false, margin: 4 };
      if (previewBarcodeRef.current) JsBarcode.default(previewBarcodeRef.current, barcodeValue, config);
    });
  }, [successItem]);

  // Photo preview
  useEffect(() => {
    if (!photoFile) { setPhotoPreview(null); return; }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  async function uploadPhotoFile(): Promise<string> {
    if (!photoFile) return "";
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("photo", photoFile);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      return data.photoUrl;
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmitNew(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);

    try {
      // Upload photo first if present
      let photoUrl = "";
      if (photoFile) {
        photoUrl = await uploadPhotoFile();
      }

      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category, size, color, material, quantity, supplierPrice, listPrice, photoUrl }),
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
      setSupplierPrice("");
      setListPrice("");
      setPhotoFile(null);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Network error — please try again");
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
      setRestockConfirm(false);
    } catch {
      setSubmitError("Network error — please try again");
      refetch();
    } finally {
      setRestocking(false);
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

  // Success: barcode
  if (successItem) {
    return (
      <div className="text-center py-8">
        <div className="bg-green-950/40 border border-green-800 rounded-2xl p-8 max-w-sm mx-auto mb-6">
          <p className="text-4xl mb-2">&#10003;</p>
          <h2 className="text-2xl font-bold text-green-400 mb-1">Item Added!</h2>
          <p className="text-green-300">{successItem.name}</p>
          {successItem.photoUrl && (
            <div className="mt-3 flex justify-center">
              <ItemPhoto url={successItem.photoUrl} size="h-24 w-24" />
            </div>
          )}
        </div>
        <div className="mb-4">
          <p className="text-sm text-gray-500 mb-2">Print Preview (actual size: 2.2&quot; x 1.2&quot;)</p>
          <div className="inline-block border-2 border-dashed border-gray-600 rounded bg-white overflow-hidden" style={{ width: "2.2in", height: "1.2in" }}>
            <BarcodeLabel item={successItem} barcodeRef={previewBarcodeRef} />
          </div>
        </div>
        <div className="space-y-3 max-w-sm mx-auto">
          <button
            onClick={() => printLabel(successItem, previewBarcodeRef.current)}
            className="block w-full bg-amber-600 hover:bg-amber-500 text-black px-6 py-4 rounded-xl min-h-[56px] text-xl font-bold shadow-lg hover:shadow-amber-500/20 transition-all"
          >
            Print Label
          </button>
          <button onClick={() => setSuccessItem(null)} className="block w-full bg-gray-800 text-gray-300 border border-gray-700 px-6 py-4 rounded-xl min-h-[44px] text-lg hover:bg-gray-700 transition-colors">
            Add Another Item
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-amber-400 mb-6">Add Stock</h1>

      {/* Restock confirmation dialog with photo */}
      {restockConfirm && restockTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-gray-900 border border-amber-700/40 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-xl font-bold text-amber-400 mb-3 text-center">Confirm Restock</h3>
            {restockTarget.photoUrl && (
              <div className="flex justify-center mb-3">
                <ItemPhoto url={restockTarget.photoUrl} size="h-32 w-32" />
              </div>
            )}
            <p className="text-center text-gray-200 font-semibold">{restockTarget.name}</p>
            <p className="text-center text-sm text-gray-400 mb-1">
              {restockTarget.size} &middot; {restockTarget.color} &middot; {restockTarget.category}
            </p>
            <p className="text-center text-sm text-gray-400 mb-4">
              Current stock: <strong className="text-gray-200">{restockTarget.quantity}</strong> &rarr; Adding <strong className="text-gray-200">{restockQty}</strong> = <strong className="text-amber-400">{restockTarget.quantity + restockQty}</strong>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setRestockConfirm(false)}
                className="flex-1 bg-gray-800 text-gray-300 py-3 rounded-xl min-h-[44px] text-lg font-medium hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRestock}
                disabled={restocking}
                className="flex-1 bg-amber-600 text-black py-3 rounded-xl min-h-[44px] text-lg font-bold shadow-md hover:bg-amber-500 transition-colors disabled:opacity-50"
              >
                {restocking ? "Restocking..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restock panel (inline) */}
      {restockTarget && !restockConfirm && (
        <div className="bg-amber-950/30 border border-amber-700/40 rounded-2xl p-5 mb-6 shadow-sm">
          <div className="flex gap-4 items-start">
            {restockTarget.photoUrl && <ItemPhoto url={restockTarget.photoUrl} />}
            <div className="flex-1">
              <h3 className="font-bold text-amber-400 text-lg mb-1">Restocking: {restockTarget.name}</h3>
              <p className="text-sm text-amber-200/60 mb-4">
                {restockTarget.itemId} &middot; {restockTarget.size} &middot; {restockTarget.color} &middot; Currently <strong className="text-amber-300">{restockTarget.quantity}</strong> in stock
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <label className="text-sm font-medium text-amber-300">Quantity to add:</label>
            <input
              type="number"
              min={1}
              value={restockQty}
              onChange={(e) => setRestockQty(Math.max(1, +e.target.value))}
              className="border border-amber-700/40 bg-black rounded-xl px-3 py-2 w-24 min-h-[44px] text-lg text-center text-white"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setRestockConfirm(true)}
              className="flex-1 bg-amber-600 text-black px-4 py-3 rounded-xl min-h-[44px] text-lg font-bold shadow-md hover:bg-amber-500 transition-colors"
            >
              Restock
            </button>
            <button
              onClick={() => { setRestockTarget(null); setRestockConfirm(false); }}
              className="bg-gray-800 text-gray-300 border border-gray-700 px-4 py-3 rounded-xl min-h-[44px] hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {submitError && (
        <div className="bg-red-950/50 border border-red-800 text-red-400 rounded-xl p-4 mb-4 shadow-sm">{submitError}</div>
      )}

      <form onSubmit={handleSubmitNew} className="bg-gray-900 rounded-2xl shadow-sm border border-amber-700/20 p-5 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-400 mb-1.5">Name *</label>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kashmir Silk"
            className="w-full border border-gray-700 bg-black rounded-xl px-4 py-3 min-h-[44px] text-lg text-white placeholder-gray-600 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-colors" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-1.5">Category *</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full border border-gray-700 bg-black rounded-xl px-4 py-3 min-h-[44px] text-lg text-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-colors">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-1.5">Size *</label>
            <select value={size} onChange={(e) => setSize(e.target.value)}
              className="w-full border border-gray-700 bg-black rounded-xl px-4 py-3 min-h-[44px] text-lg text-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-colors">
              {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-400 mb-1.5">Color *</label>
          <input type="text" required value={color} onChange={(e) => setColor(e.target.value)} placeholder="e.g. Red"
            className="w-full border border-gray-700 bg-black rounded-xl px-4 py-3 min-h-[44px] text-lg text-white placeholder-gray-600 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-colors" />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-400 mb-1.5">Material <span className="text-gray-600 font-normal">(optional)</span></label>
          <input type="text" value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="e.g. Silk, Cotton"
            className="w-full border border-gray-700 bg-black rounded-xl px-4 py-3 min-h-[44px] text-lg text-white placeholder-gray-600 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-colors" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-1.5">Quantity</label>
            <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, +e.target.value))}
              className="w-full border border-gray-700 bg-black rounded-xl px-4 py-3 min-h-[44px] text-lg text-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-1.5">Supplier Price *</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-lg">&#8377;</span>
              <input type="number" required min={0} step="0.01" value={supplierPrice} onChange={(e) => setSupplierPrice(e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-700 bg-black rounded-xl pl-8 pr-4 py-3 min-h-[44px] text-lg text-white placeholder-gray-600 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-colors" />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-amber-400 mb-1.5">Selling Price <span className="text-gray-500 font-normal text-xs">(printed on label)</span></label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-lg">$</span>
            <input type="number" min={0} step="0.01" value={listPrice} onChange={(e) => setListPrice(e.target.value)}
              placeholder="0.00"
              className="w-full border border-amber-700/50 bg-black rounded-xl pl-8 pr-4 py-3 min-h-[44px] text-xl font-semibold text-amber-300 placeholder-gray-600 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-colors" />
          </div>
        </div>

        {/* Photo capture */}
        <div>
          <label className="block text-sm font-semibold text-gray-400 mb-1.5">Photo <span className="text-gray-600 font-normal">(optional)</span></label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
            className="hidden"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="bg-gray-800 text-gray-300 px-4 py-3 rounded-xl min-h-[44px] text-sm font-medium hover:bg-gray-700 transition-colors border border-gray-700"
            >
              {photoFile ? "Change Photo" : "Take Photo"}
            </button>
            {photoPreview && (
              <div className="flex items-center gap-2">
                <img src={photoPreview} alt="Preview" className="h-12 w-12 object-cover rounded-lg border border-amber-700/30" />
                <button type="button" onClick={() => { setPhotoFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  className="text-red-400 text-sm font-medium hover:text-red-300">Remove</button>
              </div>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || uploading}
          className="w-full bg-amber-600 hover:bg-amber-500 text-black px-6 py-4 rounded-xl min-h-[56px] text-xl font-bold disabled:opacity-50 shadow-lg hover:shadow-amber-500/20 transition-all"
        >
          {uploading ? "Uploading photo..." : submitting ? "Adding..." : "Add New Item"}
        </button>
      </form>

      {/* Fuzzy match suggestions */}
      {matches.length > 0 && !restockTarget && (
        <div className="mt-6">
          <div className="bg-amber-950/30 border border-amber-700/40 rounded-2xl p-4 shadow-sm">
            <p className="text-sm font-semibold text-amber-400 mb-3">Similar items already in stock — restock instead?</p>
            <div className="space-y-2">
              {matches.map((m) => (
                <div key={m.item.itemId} className="bg-gray-900 border border-amber-700/20 rounded-xl p-4 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {m.item.photoUrl && <ItemPhoto url={m.item.photoUrl} size="h-14 w-14" />}
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-200">{m.item.name}</p>
                      <p className="text-sm text-gray-500 truncate">{m.item.size} &middot; {m.item.color} &middot; {m.item.category}</p>
                      <p className="text-sm text-gray-500">Qty: <strong className="text-gray-300">{m.item.quantity}</strong></p>
                    </div>
                  </div>
                  <button type="button" onClick={() => { setRestockTarget(m.item); setRestockQty(1); setRestockConfirm(false); }}
                    className="ml-3 bg-amber-600 text-black px-4 py-2.5 rounded-xl min-h-[44px] text-sm font-bold whitespace-nowrap shadow-md hover:bg-amber-500 transition-colors">
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
