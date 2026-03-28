import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const correct = process.env.APP_PASSWORD;

  if (!correct) {
    // No password configured — allow access
    return NextResponse.json({ success: true });
  }

  if (password === correct) {
    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { error: "Incorrect password" },
    { status: 401 }
  );
}
