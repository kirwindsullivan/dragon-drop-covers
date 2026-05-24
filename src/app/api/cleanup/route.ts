// GET /api/cleanup — daily cron job (see vercel.json, runs at 02:00 UTC).
// Deletes free-tier covers older than 30 days and exports older than 24 hours.
// Secured via CRON_SECRET env var (Vercel sends it as Authorization: Bearer).
import { NextRequest, NextResponse } from "next/server";
import { listByPrefix, deleteObject } from "@/lib/r2/client";

const MS_30_DAYS  = 30 * 24 * 60 * 60 * 1000;
const MS_24_HOURS =      24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = Date.now();
  const deleted: string[] = [];
  const errors: string[]  = [];

  // List everything under users/ once, then filter by sub-prefix + age
  const all = await listByPrefix("users/");

  const freeCoverItems = all.filter((i) => i.key.includes("/covers/free/"));
  const exportItems    = all.filter((i) => i.key.includes("/exports/"));

  for (const item of freeCoverItems) {
    if (now - item.lastModified.getTime() > MS_30_DAYS) {
      try   { await deleteObject(item.key); deleted.push(item.key); }
      catch (e) { errors.push(`${item.key}: ${String(e)}`); }
    }
  }

  for (const item of exportItems) {
    if (now - item.lastModified.getTime() > MS_24_HOURS) {
      try   { await deleteObject(item.key); deleted.push(item.key); }
      catch (e) { errors.push(`${item.key}: ${String(e)}`); }
    }
  }

  return NextResponse.json({
    deleted: deleted.length,
    errors:  errors.length,
    ...(process.env.NODE_ENV !== "production" && { details: { deleted, errors } }),
  });
}
