/**
 * POST /api/upload/export
 *   Body: { presetId: string, format: "png" | "webp" }
 *   Returns: { uploadUrl, downloadUrl, key }
 *
 * The client:
 *   1. PUTs the rendered blob directly to uploadUrl
 *   2. Triggers a browser download from downloadUrl (1-hour signed URL)
 *
 * Exports are always ephemeral — the cleanup job deletes them after 24 hours
 * regardless of tier (they live under users/{id}/exports/).
 */
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { makeExportKey, presignedPutUrl, presignedGetUrl } from "@/lib/r2/client";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { presetId, format } = await req.json() as {
    presetId?: string;
    format?: string;
  };

  const fmt = format === "webp" ? "webp" : "png";
  const contentType = fmt === "webp" ? "image/webp" : "image/png";
  const key = makeExportKey(userId, presetId ?? "export", fmt);

  const [uploadUrl, downloadUrl] = await Promise.all([
    presignedPutUrl(key, contentType),
    presignedGetUrl(key, 3_600), // download URL valid 1 hour
  ]);

  return NextResponse.json({ uploadUrl, downloadUrl, key });
}
