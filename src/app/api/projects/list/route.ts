// GET /api/projects/list
// Returns all projects for the authenticated user as an array of ProjectSummary.
// Refreshes any signed URLs that are within 1 hour of expiry.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { listUserProjects, presignedGetUrl, putProjectMeta } from "@/lib/projects/r2";
import type { ProjectSummary } from "@/lib/projects/types";

const ONE_HOUR_MS = 60 * 60 * 1000;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projects = await listUserProjects(userId);
  const now = Date.now();

  // Refresh signed URLs that are close to expiry and persist the update
  const summaries: ProjectSummary[] = await Promise.all(
    projects.map(async (project) => {
      let { coverSignedUrl } = project;

      if (project.coverKey && project.signedUrlExpiry) {
        const expiryMs = new Date(project.signedUrlExpiry).getTime();
        if (expiryMs - now < ONE_HOUR_MS) {
          try {
            coverSignedUrl = await presignedGetUrl(project.coverKey);
            const updatedProject = {
              ...project,
              coverSignedUrl,
              signedUrlExpiry: new Date(now + 86_400_000).toISOString(),
            };
            // Fire-and-forget; a stale URL just means the thumbnail won't load
            putProjectMeta(updatedProject).catch(() => {});
          } catch {
            // Keep the old URL if refresh fails
          }
        }
      }

      return {
        projectId: project.projectId,
        name: project.name,
        coverSignedUrl,
        updatedAt: project.updatedAt,
        bookSize: project.bookSize,
        tier: project.tier,
      };
    }),
  );

  // Sort newest first
  summaries.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return NextResponse.json(summaries);
}
