import { NextRequest, NextResponse } from "next/server";
import { getAllItems, appendItem, logAction } from "@/lib/sheets";
import { generateSlug } from "@/lib/slug";
import { InventoryItem } from "@/lib/types";

export async function GET() {
  try {
    const items = await getAllItems();
    return NextResponse.json(items);
  } catch (err) {
    console.error("GET /api/inventory error:", err);
    return NextResponse.json(
      { error: "Failed to fetch inventory" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, category, size, color, material, quantity, supplierPrice, photoUrl } = body;

    if (!name || !category || !size || !color) {
      return NextResponse.json(
        { error: "Name, category, size, and color are required" },
        { status: 400 }
      );
    }

    if (supplierPrice === undefined || supplierPrice === null || supplierPrice === "") {
      return NextResponse.json(
        { error: "Supplier price is required" },
        { status: 400 }
      );
    }

    const itemId = generateSlug(color, name, category, size);

    const existing = await getAllItems();
    if (existing.some((i) => i.itemId === itemId)) {
      return NextResponse.json(
        {
          error:
            "This exact item already exists. Use the restock option instead.",
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const item: InventoryItem = {
      itemId,
      name,
      category,
      size,
      color,
      material: material || "",
      quantity: quantity || 1,
      dateAdded: now,
      lastRestocked: "",
      lastSold: "",
      supplierPrice: parseFloat(supplierPrice) || 0,
      salePrice: 0,
      photoUrl: photoUrl || "",
    };

    await appendItem(item);
    await logAction("ADD", itemId, `New item: ${name}, qty ${item.quantity}, cost $${item.supplierPrice}`);
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    console.error("POST /api/inventory error:", err);
    return NextResponse.json(
      { error: "Failed to add item" },
      { status: 500 }
    );
  }
}
