import { NextRequest, NextResponse } from "next/server";
import { uploadPhoto } from "@/lib/sheets";

// Force Node.js runtime (not Edge) — needed for stream-based Drive uploads
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("photo") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No photo provided" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "File must be an image" },
        { status: 400 }
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Image must be under 5MB" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `inventory-${Date.now()}-${file.name}`;
    const photoUrl = await uploadPhoto(buffer, fileName, file.type);

    return NextResponse.json({ photoUrl });
  } catch (err) {
    console.error("Upload error:", err);
    const message = err instanceof Error ? err.message : "Failed to upload photo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
