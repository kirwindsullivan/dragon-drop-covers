// POST /api/projects/[projectId]/cover
// Issues a presigned PUT URL for uploading/replacing the project cover image.
// Deletes any existing cover object from R2 before generating a new key.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getProjectMeta, putProjectMeta, presignedGetUrl, deleteObject } from "@/lib/projects/r2";
import { presignedPutUrl } from "@/lib/r2/client";

type RouteContext = { params: Promise<{ projectId: string }> };

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
