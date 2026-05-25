// GET    /api/projects/[projectId]  — load full project meta
// PATCH  /api/projects/[projectId]  — update settings / name / bookSize
// DELETE /api/projects/[projectId]  — delete project and all its R2 objects

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getProjectMeta,
  putProjectMeta,
  deleteProjectAll,
  presignedGetUrl,
  deleteObject,
} from "@/lib/projects/r2";
import type { ProjectMeta } from "@/lib/projects/types";

type RouteContext = { params: Promise<{ projectId: string }> };

const ONE_HOUR_MS = 60 * 60 * 1000;

// ── Shared helpers ────────────────────────────────────────────────────────────

async function loadAndVerify(
  userId: string,
  projectId: string,
): Promise<{ meta: ProjectMeta } | NextResponse> {
  const meta = await getProjectMeta(userId, projectId);

  if (!meta) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (meta.clerkUserId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { meta };
}

async function maybeRefreshUrl(meta: ProjectMeta): Promise<ProjectMeta> {
  if (!meta.coverKey || !meta.signedUrlExpiry) return meta;

  const expiryMs = new Date(meta.signedUrlExpiry).getTime();
  if (Date.now() - expiryMs < ONE_HOUR_MS) return meta;

  try {
    const coverSignedUrl = await presignedGetUrl(meta.coverKey);
    return {
      ...meta,
      coverSignedUrl,
      signedUrlExpiry: new Date(Date.now() + 86_400_000).toISOString(),
    };
  } catch {
    return meta;
  }
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await ctx.params;
  const result = await loadAndVerify(userId, projectId);
  if (result instanceof NextResponse) return result;

  const meta = await maybeRefreshUrl(result.meta);

  // Persist refresh if the URL changed
  if (meta.coverSignedUrl !== result.meta.coverSignedUrl) {
    await putProjectMeta(meta);
  }

  return NextResponse.json(meta);
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await ctx.params;
  const result = await loadAndVerify(userId, projectId);
  if (result instanceof NextResponse) return result;

  let body: {
    name?: string;
    bookSize?: ProjectMeta["bookSize"];
    settings?: Partial<ProjectMeta["settings"]>;
    // [Session 4] clearCover: true → delete cover from R2 and clear meta fields
    clearCover?: boolean;
  };

  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const meta = { ...result.meta };

  if (body.name && typeof body.name === "string") {
    meta.name = body.name.trim().slice(0, 120);
  }

  if (body.bookSize) {
    const validSizes: ProjectMeta["bookSize"][] = [
      "hardcover", "softcover", "digest", "zine", "letter",
    ];
    if (validSizes.includes(body.bookSize)) {
      meta.bookSize = body.bookSize;
    }
  }

  if (body.settings && typeof body.settings === "object") {
    meta.settings = { ...meta.settings, ...body.settings };
  }

  // [Session 4] Clear cover: delete R2 object then wipe meta fields
  if (body.clearCover && meta.coverKey) {
    try { await deleteObject(meta.coverKey); } catch { /* ignore missing */ }
    meta.coverKey = null;
    meta.coverSignedUrl = null;
    meta.signedUrlExpiry = null;
  }

  meta.updatedAt = new Date().toISOString();

  await putProjectMeta(meta);

  return NextResponse.json(meta);
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await ctx.params;
  const result = await loadAndVerify(userId, projectId);
  if (result instanceof NextResponse) return result;

  await deleteProjectAll(userId, projectId);

  return NextResponse.json({ deleted: true });
}
