/**
 * POST /api/set-default-tier
 *
 * Called once after sign-up to write `publicMetadata.tier = "free"` for
 * new users who don't have a tier set yet.  Session 3 (Stripe) will update
 * this to "pro" when a subscription is created.
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getTierFromUser } from "@/lib/tier";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const existingTier = getTierFromUser(user);

  // Only write if tier not already set to avoid overwriting a future paid tier
  const alreadySet = Boolean(user.publicMetadata?.tier);
  if (!alreadySet) {
    await client.users.updateUserMetadata(userId, {
      publicMetadata: { tier: "free" },
    });
  }

  return NextResponse.json({ tier: existingTier, set: !alreadySet });
}
