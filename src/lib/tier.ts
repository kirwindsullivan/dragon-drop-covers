/**
 * Single source of truth for user tier logic.
 * Stripe plugs in here in Session 3 — just swap the metadata key or
 * replace getTierFromMetadata with a Stripe subscription lookup.
 */

export type UserTier = "free" | "pro";

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
    retentionDays: 30,
  },
  pro: {
    maxDimension: 4096,
    watermark: false,
    retentionDays: Infinity,
  },
} as const;

/** Can this tier use a given export preset? */
export function canUsePreset(tier: UserTier, isPaid: boolean): boolean {
  if (!isPaid) return true;
  return tier === "pro";
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
