/**
 * Project metadata read/write via Cloudflare R2.
 *
 * Project meta is stored as JSON objects in R2:
 *   users/{userId}/projects/{projectId}/meta.json
 *
 * Cover assets live at:
 *   users/{userId}/projects/{projectId}/covers/
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { presignedGetUrl, deleteObject, listByPrefix } from "@/lib/r2/client";
import type { ProjectMeta } from "./types";

// ── Direct R2 client (for GetObject / PutObject on JSON metadata) ─────────────

function r2Direct(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? "",
    },
    forcePathStyle: true,
  });
}

function bucket(): string {
  return process.env.CLOUDFLARE_R2_BUCKET_NAME ?? "dragon-drop-covers";
}

// ── Key helpers ───────────────────────────────────────────────────────────────

export function projectMetaKey(userId: string, projectId: string): string {
  return `users/${userId}/projects/${projectId}/meta.json`;
}

export function projectCoverDir(userId: string, projectId: string): string {
  return `users/${userId}/projects/${projectId}/covers/`;
}

// ── CRUD operations ───────────────────────────────────────────────────────────

/**
 * Fetch and parse project metadata from R2.
 * Returns null if the object does not exist (NoSuchKey) or on any parse error.
 */
export async function getProjectMeta(
  userId: string,
  projectId: string,
): Promise<ProjectMeta | null> {
  const client = r2Direct();
  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: bucket(),
        Key: projectMetaKey(userId, projectId),
      }),
    );
    const text = await res.Body?.transformToString();
    if (!text) return null;
    return JSON.parse(text) as ProjectMeta;
  } catch (err: unknown) {
    // NoSuchKey → return null; propagate other errors
    const code = (err as { Code?: string; name?: string }).Code ?? (err as { name?: string }).name;
    if (code === "NoSuchKey" || code === "NotFound") return null;
    throw err;
  }
}

/** Serialise and write project metadata to R2 as JSON. */
export async function putProjectMeta(meta: ProjectMeta): Promise<void> {
  const client = r2Direct();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: projectMetaKey(meta.clerkUserId, meta.projectId),
      Body: JSON.stringify(meta),
      ContentType: "application/json",
    }),
  );
}

/**
 * List all projects for a user by scanning their project prefix for
 * `meta.json` objects, then fetching each in parallel.
 */
export async function listUserProjects(userId: string): Promise<ProjectMeta[]> {
  const prefix = `users/${userId}/projects/`;
  const client = r2Direct();

  // Collect all meta.json keys under the user's project prefix
  const metaKeys: string[] = [];
  let token: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket(),
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key?.endsWith("meta.json")) {
        metaKeys.push(obj.Key);
      }
    }
    token = res.NextContinuationToken;
  } while (token);

  if (metaKeys.length === 0) return [];

  // Fetch and parse each meta file in parallel; skip any that fail to parse
  const results = await Promise.allSettled(
    metaKeys.map(async (key) => {
      const res = await client.send(
        new GetObjectCommand({ Bucket: bucket(), Key: key }),
      );
      const text = await res.Body?.transformToString();
      if (!text) throw new Error(`Empty meta at ${key}`);
      return JSON.parse(text) as ProjectMeta;
    }),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<ProjectMeta> => r.status === "fulfilled")
    .map((r) => r.value);
}

/**
 * Delete every object under `users/{userId}/projects/{projectId}/`
 * (the meta.json and any cover/export files).
 */
export async function deleteProjectAll(
  userId: string,
  projectId: string,
): Promise<void> {
  const prefix = `users/${userId}/projects/${projectId}/`;
  const items = await listByPrefix(prefix);

  // Delete each object; use the shared deleteObject helper from r2/client
  await Promise.all(items.map((item) => deleteObject(item.key)));
}

// Re-export helpers used by route handlers so they only need one import
export { presignedGetUrl, deleteObject };
