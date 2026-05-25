import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, Flame, Zap, Shield, CheckCircle2 } from "lucide-react";
import { getTierFromUser, TIER_LIMITS } from "@/lib/tier";
import { UpgradeButton, ManageButton } from "@/components/billing/BillingButtons";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const { upgraded } = await searchParams;
  const justUpgraded = upgraded === "true";

  const tier = getTierFromUser(user);
  const limits = TIER_LIMITS[tier];

  const displayName =
    user.fullName ||
    user.emailAddresses[0]?.emailAddress ||
    "Creator";

  const initials =
    [user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join("") ||
    user.emailAddresses[0]?.emailAddress[0]?.toUpperCase() ||
    "?";

  return (
    <div
      className="min-h-screen p-6 md:p-10"
      style={{
        background:
          "radial-gradient(ellipse at 60% 40%, #1a0040 0%, #0d001a 55%, #000 100%)",
      }}
    >
      <div className="max-w-xl mx-auto space-y-6">
        {/* Top nav */}
        <div className="flex items-center justify-between">
          <Link
            href="/editor"
            className="flex items-center gap-1.5 text-sm text-brand-300/60 hover:text-white transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to editor
          </Link>
          <div className="flex items-center gap-1.5">
            <Flame className="h-4 w-4 text-brand-400" />
            <span className="text-sm font-semibold text-white">
              Dragon Drop Covers
            </span>
          </div>
        </div>

        {/* Upgrade success banner */}
        {justUpgraded && (
          <div className="flex items-center gap-3 rounded-2xl border border-green-500/30 bg-green-950/40 p-4">
            <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-300">
                Welcome to Pro!
              </p>
              <p className="text-xs text-green-400/70">
                4K exports, no watermarks, and unlimited storage are now unlocked.
              </p>
            </div>
          </div>
        )}

        {/* Profile card */}
        <div className="rounded-2xl border border-white/10 bg-black/30 p-5 flex items-center gap-4">
          {user.imageUrl ? (
            <Image
              src={user.imageUrl}
              alt={displayName}
              width={64}
              height={64}
              className="h-16 w-16 rounded-full object-cover ring-2 ring-brand-700/50"
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-brand-700 flex items-center justify-center text-2xl font-bold text-white ring-2 ring-brand-700/50">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-white truncate">
              {displayName}
            </h1>
            <p className="text-sm text-brand-300/50 truncate">
              {user.emailAddresses[0]?.emailAddress}
            </p>
          </div>
        </div>

        {/* Plan card */}
        <div className="rounded-2xl border border-white/10 bg-black/30 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-300/50 mb-1">
                Current plan
              </p>
              <p className="text-2xl font-bold text-white">
                {tier === "pro" ? "Pro" : "Free"}
              </p>
            </div>
            <span
              className={
                tier === "pro"
                  ? "flex items-center gap-1 px-3 py-1 rounded-full bg-brand-500 text-white text-sm font-semibold"
                  : "flex items-center gap-1 px-3 py-1 rounded-full bg-surface-3 text-brand-300 text-sm font-semibold"
              }
            >
              {tier === "pro" ? (
                <>
                  <Zap className="h-3.5 w-3.5" /> Pro
                </>
              ) : (
                <>
                  <Shield className="h-3.5 w-3.5" /> Free
                </>
              )}
            </span>
          </div>

          {/* Limits summary */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Max export", value: `${limits.maxDimension}px` },
              { label: "Watermark", value: limits.watermark ? "Yes" : "None" },
              {
                label: "Storage",
                value:
                  limits.retentionDays === Infinity
                    ? "Forever"
                    : `${limits.retentionDays} days`,
              },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl border border-white/5 bg-surface-1/60 p-3 text-center"
              >
                <p className="text-xs text-brand-300/40 mb-1">{label}</p>
                <p className="text-sm font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>

          {/* Free → Upgrade CTA */}
          {tier === "free" && (
            <div className="pt-2 border-t border-white/10 space-y-3">
              <p className="text-sm text-brand-300/60">
                Unlock 4K exports, no watermarks, and unlimited storage with Pro.
              </p>
              <UpgradeButton />
            </div>
          )}

          {/* Pro → Manage subscription */}
          {tier === "pro" && (
            <div className="pt-2 border-t border-white/10 space-y-3">
              <p className="text-sm text-brand-300/60">
                You&apos;re on Pro. Manage billing, update your card, or cancel anytime.
              </p>
              <ManageButton />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
