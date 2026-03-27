import { NextRequest, NextResponse } from "next/server";
import { updateItem } from "@/lib/sheets";

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

    await updateItem(itemId, updates);
    return NextResponse.json({ success: true, itemId, ...updates });
  } catch (err) {
    console.error("PATCH /api/inventory/[itemId] error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to update item";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
