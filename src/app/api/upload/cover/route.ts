/**
 * POST /api/upload/cover
 *   Body: { contentType: string, filename: string }
 *   Returns: { uploadUrl, readUrl, key }
 *   The client PUTs the file directly to uploadUrl (R2 presigned), then uses
 *   readUrl as the Three.js texture source.
 *
 * DELETE /api/upload/cover
 *   Body: { key: string }
 *   Removes a cover from R2.
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  makeCoverKey,
  presignedPutUrl,
  presignedGetUrl,
  deleteObject,
  assertOwnership,
} from "@/lib/r2/client";
import { getTierFromUser } from "@/lib/tier";

// ── POST — request presigned upload URL ───────────────────────────────────────

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { contentType, filename } = body as { contentType?: string; filename?: string };

  if (!contentType?.startsWith("image/")) {
    return NextResponse.json({ error: "Invalid content type" }, { status: 400 });
  }

  // Resolve real tier from Clerk metadata
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const tier = getTierFromUser(user);

  const key = makeCoverKey(userId, tier, filename ?? "cover");

  // Both URLs generated server-side — credentials never reach the client
  const [uploadUrl, readUrl] = await Promise.all([
    presignedPutUrl(key, contentType),
    presignedGetUrl(key, 86_400), // read URL valid 24h
  ]);

  return NextResponse.json({ uploadUrl, readUrl, key });
}

// ── DELETE — remove a cover from R2 ──────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { key } = await req.json() as { key?: string };
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });

  try {
    assertOwnership(key, userId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await deleteObject(key);
  return NextResponse.json({ ok: true });
}
