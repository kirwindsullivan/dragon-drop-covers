/**
 * Cloudflare R2 client — server-side only.
 * All operations use the AWS SDK v3 S3-compatible API.
 *
 * Key structure:
 *   users/{userId}/covers/free/{ts}-{filename}   ← 30-day retention
 *   users/{userId}/covers/pro/{ts}-{filename}    ← indefinite
 *   users/{userId}/exports/{ts}-{preset}.{fmt}  ← 24-hour retention
 *
 * Retention is determined by prefix so cleanup can use ListObjectsV2
 * + LastModified without an extra HeadObject per file.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { UserTier } from "@/lib/tier";

// ── Client singleton ──────────────────────────────────────────────────────────

let _r2: S3Client | null = null;

function r2(): S3Client {
  if (_r2) return _r2;
  _r2 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     process.env.CLOUDFLARE_R2_ACCESS_KEY_ID     ?? "",
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? "",
    },
    forcePathStyle: true,
  });
  return _r2;
}

function bucket(): string {
  return process.env.CLOUDFLARE_R2_BUCKET_NAME ?? "dragon-drop-covers";
}

// ── Key helpers ───────────────────────────────────────────────────────────────

/** Sanitise a filename for use inside an R2 key */
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

export function makeCoverKey(userId: string, tier: UserTier, filename: string): string {
  return `users/${userId}/covers/${tier}/${Date.now()}-${safeName(filename)}`;
}

export function makeExportKey(userId: string, presetId: string, format: string): string {
  return `users/${userId}/exports/${Date.now()}-${safeName(presetId)}.${format}`;
}

/**
 * Guard: throw if key does not belong to the given user.
 * Prevents one user from accessing or deleting another's files.
 */
export function assertOwnership(key: string, userId: string): void {
  if (!key.startsWith(`users/${userId}/`)) {
    throw new Error("Forbidden: key does not belong to this user");
  }
}

// ── Presigned URLs ────────────────────────────────────────────────────────────

/**
 * 5-minute presigned PUT URL.
 * The browser uploads directly to R2 — never passes through Vercel.
 * R2 bucket must allow CORS PUT from the app origin (see DEPLOY.md).
 */
export async function presignedPutUrl(
  key: string,
  contentType: string,
): Promise<string> {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn: 300 },
  );
}

/** Presigned GET URL for reading a file from R2. */
export async function presignedGetUrl(
  key: string,
  expiresIn = 86_400, // 24 hours default
): Promise<string> {
  return getSignedUrl(
    r2(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn },
  );
}

// ── Direct server-side operations ─────────────────────────────────────────────

/**
 * Download a raw object from R2 and return its bytes + content-type.
 * Used by API routes that proxy images to the browser (avoids cross-origin
 * restrictions that prevent Three.js from loading them as WebGL textures).
 */
export async function getObjectBytes(
  key: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    const res = await r2().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) return null;
    return { bytes, contentType: res.ContentType ?? "image/octet-stream" };
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await r2().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/** Upload a Buffer directly (used for export blobs when presigned upload isn't used). */
export async function putBuffer(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await r2().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }),
  );
}

// ── Cleanup helpers ───────────────────────────────────────────────────────────

export interface R2ListItem {
  key: string;
  lastModified: Date;
}

/** List all objects under a prefix (handles pagination automatically). */
export async function listByPrefix(prefix: string): Promise<R2ListItem[]> {
  const items: R2ListItem[] = [];
  let token: string | undefined;
  do {
    const res = await r2().send(
      new ListObjectsV2Command({
        Bucket: bucket(),
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key && obj.LastModified) {
        items.push({ key: obj.Key, lastModified: obj.LastModified });
      }
    }
    token = res.NextContinuationToken;
  } while (token);
  return items;
}
