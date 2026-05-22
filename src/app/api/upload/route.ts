import { NextRequest, NextResponse } from "next/server";
import { getUploadUrl, coverKey } from "@/lib/r2/client";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const { contentType, userId = "anon" } = await req.json();

  if (!contentType?.startsWith("image/")) {
    return NextResponse.json({ error: "Invalid content type" }, { status: 400 });
  }

  const fileId = randomUUID();
  const key = coverKey(userId, fileId);
  const url = await getUploadUrl(key, contentType);

  return NextResponse.json({ uploadUrl: url, key, fileId });
}
