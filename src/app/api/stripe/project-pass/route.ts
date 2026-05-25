// POST /api/stripe/project-pass
// Creates a Stripe Checkout session for a one-time Project Pass ($25).
// On success the webhook (checkout.session.completed, type=project_pass) grants credits.

import { NextResponse } from "next/server";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { stripeClient } from "@/lib/stripe/client";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // ── Get or create Stripe customer ─────────────────────────────────────────
  let customerId = user.publicMetadata?.stripeCustomerId as string | undefined;

  if (!customerId) {
    const customer = await stripeClient().customers.create({
      email: user.emailAddresses[0]?.emailAddress,
      name: user.fullName ?? undefined,
      metadata: { clerkUserId: userId },
    });
    customerId = customer.id;

    const clerk = await clerkClient();
    await clerk.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...user.publicMetadata,
        stripeCustomerId: customerId,
      },
    });
  }

  // ── Create one-time checkout session ──────────────────────────────────────
  const session = await stripeClient().checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price: process.env.STRIPE_PROJECT_PASS_PRICE_ID!,
        quantity: 1,
      },
    ],
    success_url: `${appUrl}/dashboard?pass_purchased=true`,
    cancel_url: `${appUrl}/dashboard`,
    metadata: { clerkUserId: userId, type: "project_pass" },
    payment_intent_data: {
      metadata: { clerkUserId: userId, type: "project_pass" },
    },
  });

  return NextResponse.json({ url: session.url });
}
