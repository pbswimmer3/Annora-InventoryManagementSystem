import { NextRequest, NextResponse } from "next/server";
import { createBackup, logAction } from "@/lib/sheets";

export async function POST(req: NextRequest) {
  // Verify this is from Vercel Cron or has the correct secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const backupName = await createBackup();
    await logAction("BACKUP", "-", `Created backup: ${backupName}`);
    return NextResponse.json({ success: true, backupName });
  } catch (err) {
    console.error("Backup failed:", err);
    const message = err instanceof Error ? err.message : "Backup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
