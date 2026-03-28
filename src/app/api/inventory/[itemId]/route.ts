import { NextRequest, NextResponse } from "next/server";
import { updateItem, logAction, getAllItems } from "@/lib/sheets";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await params;
    const body = await req.json();
    const { quantity, lastRestocked, lastSold } = body;

    const updates: Record<string, string | number> = {};
    if (quantity !== undefined) updates.quantity = quantity;
    if (lastRestocked !== undefined) updates.lastRestocked = lastRestocked;
    if (lastSold !== undefined) updates.lastSold = lastSold;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No updates provided" },
        { status: 400 }
      );
    }

    // Get old quantity for log details
    const items = await getAllItems();
    const oldItem = items.find((i) => i.itemId === itemId);
    const oldQty = oldItem?.quantity ?? "?";

    await updateItem(itemId, updates);

    // Determine action type for the log
    let action = "UPDATE";
    let details = `Updated: ${JSON.stringify(updates)}`;
    if (lastRestocked) {
      action = "RESTOCK";
      details = `Qty: ${oldQty} -> ${quantity}`;
    } else if (lastSold) {
      action = "SELL";
      details = `Qty: ${oldQty} -> ${quantity}`;
    } else if (quantity !== undefined && Number(quantity) > Number(oldQty)) {
      action = "UNDO_SELL";
      details = `Qty: ${oldQty} -> ${quantity} (undo)`;
    }

    await logAction(action, itemId, details);

    return NextResponse.json({ success: true, itemId, ...updates });
  } catch (err) {
    console.error("PATCH /api/inventory/[itemId] error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to update item";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
