// GET  /api/projects/[projectId]/cover — proxy cover image to browser (same-origin, no CORS)
// POST /api/projects/[projectId]/cover — issue presigned PUT URL for uploading/replacing cover.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getProjectMeta, putProjectMeta, presignedGetUrl, deleteObject } from "@/lib/projects/r2";
import { presignedPutUrl, getObjectBytes } from "@/lib/r2/client";

type RouteContext = { params: Promise<{ projectId: string }> };

// ── GET ───────────────────────────────────────────────────────────────────────
// Proxies the cover image through our server so the browser receives it from
// the same origin. This avoids R2 cross-origin restrictions that prevent
// Three.js from loading the image as a WebGL texture.

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await ctx.params;

  const meta = await getProjectMeta(userId, projectId);
  if (!meta) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (meta.clerkUserId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!meta.coverKey) return NextResponse.json({ error: "No cover" }, { status: 404 });

  const cover = await getObjectBytes(meta.coverKey);
  if (!cover) return NextResponse.json({ error: "Cover not found in storage" }, { status: 404 });

  return new NextResponse(Buffer.from(cover.bytes), {
    headers: {
      "Content-Type": cover.contentType,
      // Private cache: browser can reuse for 1 h but must revalidate after
      "Cache-Control": "private, max-age=3600",
    },
  });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await ctx.params;

  const meta = await getProjectMeta(userId, projectId);
  if (!meta) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (meta.clerkUserId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let contentType: string;
  let filename: string;

  try {
    const body = await req.json() as { contentType?: string; filename?: string };
    if (!body.contentType || typeof body.contentType !== "string") {
      return NextResponse.json({ error: "contentType is required" }, { status: 400 });
    }
    if (!body.filename || typeof body.filename !== "string") {
      return NextResponse.json({ error: "filename is required" }, { status: 400 });
    }
    contentType = body.contentType;
    filename = body.filename;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Delete existing cover if one exists
  if (meta.coverKey) {
    try {
      await deleteObject(meta.coverKey);
    } catch {
      // Non-fatal — the old object may already be gone
    }
  }

  // Generate sanitised key
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const key = `users/${userId}/projects/${projectId}/covers/${Date.now()}-${safeFilename}`;

  // Presigned upload URL (5 min) and read URL (24 h)
  const [uploadUrl, readUrl] = await Promise.all([
    presignedPutUrl(key, contentType),
    presignedGetUrl(key),
  ]);

  const now = Date.now();
  const updatedMeta = {
    ...meta,
    coverKey: key,
    coverSignedUrl: readUrl,
    signedUrlExpiry: new Date(now + 86_400_000).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };

  await putProjectMeta(updatedMeta);

  return NextResponse.json({ uploadUrl, readUrl, key });
}
