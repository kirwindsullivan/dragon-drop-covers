/**
 * GET /api/upload/signed-url?key={r2ObjectKey}
 *
 * Refreshes an expired read URL for a file the authenticated user owns.
 * Called on page load when a coverR2Key is found in localStorage but the
 * cached signed URL has expired (they last 24 hours).
 */
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { assertOwnership, presignedGetUrl } from "@/lib/r2/client";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });

  try {
    assertOwnership(key, userId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const readUrl = await presignedGetUrl(key, 86_400);
  return NextResponse.json({ readUrl });
}
