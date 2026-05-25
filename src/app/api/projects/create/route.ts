// POST /api/projects/create
// Creates a new project for the authenticated user.
// Eligibility: Pro users → unlimited. Users with projectCredits → consume one credit.
// All others → 403 no_access.

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { putProjectMeta } from "@/lib/projects/r2";
import type { ProjectMeta } from "@/lib/projects/types";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const meta = user.publicMetadata as Record<string, unknown>;
  const userTier = meta.tier as string | undefined;
  const projectCredits = (meta.projectCredits as number | undefined) ?? 0;

  const isPro = userTier === "pro";
  const hasCredits = projectCredits > 0;

  // Eligibility check
  if (!isPro && !hasCredits) {
    return NextResponse.json(
      { error: "No active subscription or Project Pass credits", code: "no_access" },
      { status: 403 },
    );
  }

  // Parse optional name from request body
  let name = "Untitled Project";
  try {
    const body = await req.json() as { name?: string };
    if (body.name && typeof body.name === "string" && body.name.trim().length > 0) {
      name = body.name.trim().slice(0, 120);
    }
  } catch {
    // Body is optional — silently ignore parse errors
  }

  const projectId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Determine project-level tier
  const projectTier: ProjectMeta["tier"] = isPro
    ? "pro"
    : hasCredits
      ? "project_pass"
      : "free";

  const projectMeta: ProjectMeta = {
    projectId,
    clerkUserId: userId,
    name,
    createdAt: now,
    updatedAt: now,
    coverKey: null,
    coverSignedUrl: null,
    signedUrlExpiry: null,
    bookSize: "hardcover",
    settings: {
      background: {},
      lighting: {},
      adjustments: {},
      finish: "matte",
      overlayTitle: "",
      overlayTagline: "",
    },
    exportCount: 0,
    tier: projectTier,
  };

  // If a credit was used, decrement the count before writing the project
  if (!isPro && hasCredits) {
    const clerk = await clerkClient();
    await clerk.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...meta,
        projectCredits: projectCredits - 1,
      },
    });
  }

  await putProjectMeta(projectMeta);

  return NextResponse.json({ projectId, name: projectMeta.name });
}
