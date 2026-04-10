"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Fuse from "fuse.js";
import { useInventory } from "@/lib/useInventory";
import { InventoryItem, CATEGORIES, SIZES } from "@/lib/types";

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "..." : str;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
        padding: "0.05in 0.08in",
        boxSizing: "border-box",
        gap: "1px",
        background: "white",
      }}
    >
      {item.listPrice > 0 && (
        <p style={{ fontSize: "14pt", fontWeight: "bold", textAlign: "center", color: "black", lineHeight: 1, letterSpacing: "0.02em" }}>
          ${item.listPrice.toFixed(2)}
        </p>
      )}
      <svg ref={barcodeRef} />
      <p style={{ fontSize: "7pt", textAlign: "center", lineHeight: 1.1, color: "black" }}>
        {item.category}
      </p>
      <p style={{ fontFamily: "monospace", fontSize: "6pt", textAlign: "center", lineHeight: 1.1, color: "black" }}>
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
 * Primary print method: generate a PDF at exact label dimensions and open it
 * in a new tab. PDFs bypass Safari's print quirks — no headers/footers, no
 * browser margins, and the page size is embedded in the PDF metadata.
 *
 * Content is inset slightly (0.05") from the page edges to stay within the
 * printer's imageable area (hardware margins).
 */
function openLabelPDF(
  item: InventoryItem,
  jsPDFClass: typeof import("jspdf").jsPDF,
  barcodeDataUrl: string | null,
) {
  const pw = 2.2;
  const ph = 1.2;
  const margin = 0.05; // inset to avoid hardware margin clipping
  const doc = new jsPDFClass({ orientation: "landscape", unit: "in", format: [ph, pw] });

  let y = margin + 0.08;
  if (item.listPrice > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(`$${item.listPrice.toFixed(2)}`, pw / 2, y, { align: "center" });
    y += 0.16;
  }

  if (barcodeDataUrl) {
    const barcodeW = pw - margin * 2 - 0.1; // ~2.0" wide
    const barcodeH = 0.48;
    const bx = (pw - barcodeW) / 2;
    doc.addImage(barcodeDataUrl, "PNG", bx, y, barcodeW, barcodeH);
    y += barcodeH + 0.03;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(item.category, pw / 2, y, { align: "center" });
  y += 0.08;

  doc.setFont("courier", "normal");
  doc.setFontSize(6);
  const idLine = `${item.itemId.split("-")[0]}-${item.color}-${item.size}`;
  doc.text(idLine, pw / 2, y, { align: "center" });

  // Open as blob URL in new tab — works reliably on iOS Safari
  const pdfBlob = doc.output("blob");
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Fallback: open an HTML popup with only the label + a print button.
 * Includes a back button. Note: Safari adds headers/footers to HTML prints
 * and ignores @page size, so the PDF method above is preferred.
 */
function printLabelPopup(item: InventoryItem, barcodeDataUrl: string | null) {
  const w = window.open("", "_blank");
  if (!w) {
    window.print();
    return;
  }

  const price =
    item.listPrice > 0
      ? `<div style="font-size:14pt;font-weight:bold;text-align:center;line-height:1;letter-spacing:0.02em">$${item.listPrice.toFixed(2)}</div>`
      : "";
  const barcode = barcodeDataUrl
    ? `<img src="${barcodeDataUrl}" style="max-width:1.8in;height:auto;display:block" alt="barcode">`
    : "";
  const category = escapeHtml(item.category);
  const idLine = `${escapeHtml(item.itemId.split("-")[0])}-${escapeHtml(item.color)}-${escapeHtml(item.size)}`;

  w.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Print Label</title>
<style>
  @page{size:2.2in 1.2in;margin:0}
  *{margin:0;padding:0;box-sizing:border-box}
  @media print{
    html,body{width:2.2in;height:1.2in;overflow:hidden;margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .screen-ui{display:none!important}
  }
  .label{
    width:2.2in;height:1.2in;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    padding:0.05in 0.08in;gap:1px;
    background:#fff;font-family:Helvetica,Arial,sans-serif;overflow:hidden;
  }
  .cat{font-size:7pt;text-align:center;line-height:1.1}
  .iid{font-family:'Courier New',monospace;font-size:6pt;text-align:center;line-height:1.1}
  .screen-ui{text-align:center;padding:24px;font-family:-apple-system,system-ui,sans-serif}
  .btn{background:#d97706;color:#000;border:none;padding:16px 40px;border-radius:14px;font-size:22px;font-weight:bold;cursor:pointer;margin:12px auto 0;display:block;-webkit-tap-highlight-color:transparent;min-height:56px}
  .btn:active{background:#b45309}
  .back{background:#374151;color:#d1d5db;border:1px solid #4b5563;padding:12px 32px;border-radius:12px;font-size:16px;cursor:pointer;margin:8px auto 0;display:block;-webkit-tap-highlight-color:transparent}
  .back:active{background:#1f2937}
  .tips{max-width:340px;margin:16px auto;padding:16px;background:#fffbeb;border:1px solid #f59e0b;border-radius:12px;font-size:15px;line-height:1.7;text-align:left;color:#92400e}
  .tips b{color:#78350f}
</style>
</head>
<body>
<div class="label">${price}${barcode}<div class="cat">${category}</div><div class="iid">${idLine}</div></div>
<div class="screen-ui">
  <button class="btn" onclick="window.print()">Tap to Print</button>
  <button class="back" onclick="window.close()">Back</button>
  <div class="tips">
    <b>Printing tips:</b><br>
    1. Tap the button above<br>
    2. Select your label printer<br>
    3. Set Paper Size to <b>2.2&quot; &times; 1.2&quot;</b><br>
    4. Make sure scaling is at <b>100%</b> (no fit-to-page)<br>
    5. Print!
  </div>
</div>
</body>
</html>`);
  w.document.close();
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

  // Pre-loaded resources for synchronous label printing (iOS Safari requirement)
  const [jsPDFClass, setJsPDFClass] = useState<typeof import("jspdf").jsPDF | null>(null);
  const [barcodeDataUrl, setBarcodeDataUrl] = useState<string | null>(null);

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

  // Render barcodes and pre-load print resources
  useEffect(() => {
    if (!successItem) {
      setBarcodeDataUrl(null);
      setJsPDFClass(null);
      return;
    }
    const barcodeValue = successItem.itemId.split('-')[0];
    import("jsbarcode").then((JsBarcode) => {
      const config = { format: "CODE128", width: 3, height: 50, displayValue: false, margin: 4 };
      if (previewBarcodeRef.current) {
        JsBarcode.default(previewBarcodeRef.current, barcodeValue, config);
        // Pre-render barcode to PNG data URL for the PDF
        svgToDataUrl(previewBarcodeRef.current).then(setBarcodeDataUrl);
      }
    });
    // Pre-load jsPDF so the print click handler is synchronous
    import("jspdf").then((mod) => setJsPDFClass(() => mod.jsPDF));
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
        {/* ── Print-only zone: rendered by @media print from globals.css ── */}
        <div
          id="print-label-zone"
          style={{
            position: "absolute",
            width: "1px",
            height: "1px",
            overflow: "hidden",
            clip: "rect(0,0,0,0)",
            whiteSpace: "nowrap",
          }}
        >
          <div
            style={{
              width: "2.2in",
              height: "1.2in",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "0.05in 0.08in",
              gap: "1px",
              background: "white",
              fontFamily: "Helvetica, Arial, sans-serif",
            }}
          >
            {successItem.listPrice > 0 && (
              <p style={{ fontSize: "14pt", fontWeight: "bold", textAlign: "center", color: "black", lineHeight: 1 }}>
                ${successItem.listPrice.toFixed(2)}
              </p>
            )}
            {barcodeDataUrl && (
              <img src={barcodeDataUrl} alt="barcode" style={{ maxWidth: "1.8in", height: "auto" }} />
            )}
            <p style={{ fontSize: "7pt", textAlign: "center", lineHeight: 1.1, color: "black" }}>
              {successItem.category}
            </p>
            <p style={{ fontFamily: "monospace", fontSize: "6pt", textAlign: "center", lineHeight: 1.1, color: "black" }}>
              {successItem.itemId.split("-")[0]}-{successItem.color}-{successItem.size}
            </p>
          </div>
        </div>

        {/* ── Screen UI (hidden during print) ── */}
        <div className="print-hide">
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
            <p className="text-sm text-gray-500 mb-2">Print Preview (actual size: 2.2&quot; &times; 1.2&quot;)</p>
            <div className="inline-block border-2 border-dashed border-gray-600 rounded bg-white overflow-hidden" style={{ width: "2.2in", height: "1.2in" }}>
              <BarcodeLabel item={successItem} barcodeRef={previewBarcodeRef} />
            </div>
          </div>
          <div className="space-y-3 max-w-sm mx-auto">
            <button
              onClick={() => {
                if (jsPDFClass) openLabelPDF(successItem, jsPDFClass, barcodeDataUrl);
              }}
              disabled={!jsPDFClass || !barcodeDataUrl}
              className="block w-full bg-amber-600 hover:bg-amber-500 text-black px-6 py-4 rounded-xl min-h-[56px] text-xl font-bold shadow-lg hover:shadow-amber-500/20 transition-all disabled:opacity-50"
            >
              {jsPDFClass && barcodeDataUrl ? "Print Label (PDF)" : "Loading..."}
            </button>
            <button
              onClick={() => printLabelPopup(successItem, barcodeDataUrl)}
              disabled={!barcodeDataUrl}
              className="block w-full bg-gray-800 text-gray-300 border border-gray-700 px-6 py-3 rounded-xl min-h-[44px] text-base hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              Print from Browser Instead
            </button>
            <button onClick={() => setSuccessItem(null)} className="block w-full bg-gray-800 text-gray-300 border border-gray-700 px-6 py-4 rounded-xl min-h-[44px] text-lg hover:bg-gray-700 transition-colors">
              Add Another Item
            </button>
          </div>
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
