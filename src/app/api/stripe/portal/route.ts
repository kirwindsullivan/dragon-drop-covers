// POST /api/stripe/portal
// Creates a Stripe Customer Portal session so Pro users can manage / cancel.
import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { stripeClient } from "@/lib/stripe/client";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await currentUser();
  const customerId = user?.publicMetadata?.stripeCustomerId as string | undefined;

  if (!customerId) {
    return NextResponse.json({ error: "No Stripe customer found" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const session = await stripeClient().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/dashboard`,
  });

  return NextResponse.json({ url: session.url });
}
