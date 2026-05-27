/**
 * Single source of truth for user tier logic.
 * Stripe plugs in here in Session 3 — just swap the metadata key or
 * replace getTierFromMetadata with a Stripe subscription lookup.
 */

// [Session 4] Added "project_pass" — a project-level tier for one-time pass purchases.
// getTierFromUser still only returns "free" | "pro" (user account tier).
// Project tier is stored separately in the editor store / project meta.
export type UserTier = "free" | "pro" | "project_pass";

interface WithPublicMetadata {
  publicMetadata?: Record<string, unknown>;
}

/**
 * Extract tier from any Clerk user object (works for both server-side
 * `currentUser()` and client-side `useUser().user`).
 * Defaults to "free" for new users who don't have the key set yet.
 */
export function getTierFromUser(user: WithPublicMetadata | null | undefined): UserTier {
  const tier = user?.publicMetadata?.tier;
  return tier === "pro" ? "pro" : "free";
}

export const TIER_LIMITS = {
  free: {
    maxDimension: 1080,
    watermark: true,
    retentionDays: 14, // [Fix session] updated from 30 → 14 days
  },
  // [Session 4] Project Pass: same resolution as free, no watermark, 90-day retention
  project_pass: {
    maxDimension: 1080,
    watermark: false,
    retentionDays: 90,
  },
  pro: {
    maxDimension: 4096,
    watermark: false,
    retentionDays: Infinity,
  },
} as const;

/** Can this tier use a given export preset? */
// [Session 4] project_pass unlocks all presets (same as pro)
export function canUsePreset(tier: UserTier, isPaid: boolean): boolean {
  if (!isPaid) return true;
  return tier === "pro" || tier === "project_pass";
}

/** Cap export dimensions to tier limit */
export function capDimensions(
  width: number,
  height: number,
  tier: UserTier,
): { width: number; height: number } {
  const max = TIER_LIMITS[tier].maxDimension;
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}
