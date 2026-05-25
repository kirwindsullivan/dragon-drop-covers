// POST /api/webhooks/stripe
// Stripe sends signed events here. We update Clerk publicMetadata to keep
// tier in sync with the subscription state.
//
// Events handled:
//   checkout.session.completed      → tier = "pro"
//   customer.subscription.updated   → tier = "pro" | "free" based on status
//   customer.subscription.deleted   → tier = "free"
//
// This route is public (no Clerk auth) — secured by Stripe's webhook signature.
import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { stripeClient } from "@/lib/stripe/client";
import type Stripe from "stripe";

async function setUserTier(
  clerkUserId: string,
  tier: "free" | "pro",
  extra?: Record<string, unknown>,
) {
  const clerk = await clerkClient();
  const user = await clerk.users.getUser(clerkUserId);
  await clerk.users.updateUserMetadata(clerkUserId, {
    publicMetadata: {
      ...user.publicMetadata,
      tier,
      ...extra,
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error("Stripe webhook signature error:", err);
    return NextResponse.json({ error: `Webhook error: ${String(err)}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      // ── Checkout completed ──────────────────────────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const clerkUserId = session.metadata?.clerkUserId;
        if (clerkUserId && session.payment_status === "paid") {
          await setUserTier(clerkUserId, "pro", {
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
          });
        }
        break;
      }

      // ── Subscription updated (renewal, plan change, cancellation pending) ──
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customer = await stripeClient().customers.retrieve(
          sub.customer as string,
        ) as Stripe.Customer;
        const clerkUserId = customer.metadata?.clerkUserId;
        if (clerkUserId) {
          const tier =
            sub.status === "active" || sub.status === "trialing" ? "pro" : "free";
          await setUserTier(clerkUserId, tier);
        }
        break;
      }

      // ── Subscription deleted (cancelled and expired) ────────────────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customer = await stripeClient().customers.retrieve(
          sub.customer as string,
        ) as Stripe.Customer;
        const clerkUserId = customer.metadata?.clerkUserId;
        if (clerkUserId) {
          await setUserTier(clerkUserId, "free");
        }
        break;
      }

      default:
        // Unhandled event type — ignore
        break;
    }
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
