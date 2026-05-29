import type { BackgroundPreset, ExportPreset, BookSize } from "@/types";

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { id: "arcane-night",   name: "Arcane Night",   mode: "gradient", value: "#0d001a", value2: "#1a0040", angle: 135 },
  { id: "dark-stone",     name: "Dark Stone",     mode: "gradient", value: "#111111", value2: "#2a2a2a", angle: 180 },
  { id: "ember-forge",    name: "Ember Forge",    mode: "gradient", value: "#1a0500", value2: "#3d1200", angle: 160 },
  { id: "deep-forest",    name: "Deep Forest",    mode: "gradient", value: "#001a08", value2: "#003314", angle: 145 },
  { id: "blood-moon",     name: "Blood Moon",     mode: "gradient", value: "#1a0000", value2: "#3d0a0a", angle: 120 },
  { id: "void",           name: "Void",           mode: "solid",    value: "#000000" },
  { id: "shadow-realm",   name: "Shadow Realm",   mode: "gradient", value: "#05000d", value2: "#10001f", angle: 150 },
  { id: "ocean-deep",     name: "Ocean Deep",     mode: "gradient", value: "#001020", value2: "#002040", angle: 170 },
  { id: "twilight",       name: "Twilight",       mode: "gradient", value: "#100010", value2: "#200a3a", angle: 125 },
  { id: "ash-grey",       name: "Ash Grey",       mode: "gradient", value: "#1a1a1a", value2: "#2d2d2d", angle: 180 },
  { id: "celestial",      name: "Celestial",      mode: "gradient", value: "#000d1a", value2: "#001a33", angle: 200 },
  { id: "infernal",       name: "Infernal",       mode: "gradient", value: "#1a0800", value2: "#2d1500", angle: 140 },
];

export const EXPORT_PRESETS: ExportPreset[] = [
  { id: "ks-header",       platform: "Kickstarter",  name: "Campaign Header",    width: 1920, height: 1080 },
  { id: "ks-card",         platform: "Kickstarter",  name: "Project Card",       width: 1024, height: 576  },
  { id: "ks-update",       platform: "Kickstarter",  name: "Update Post",        width: 1200, height: 675  },
  { id: "bk-banner",       platform: "BackerKit",    name: "Campaign Banner",    width: 1920, height: 1080 },
  { id: "bk-reward",       platform: "BackerKit",    name: "Reward Tier",        width: 800,  height: 600  },
  { id: "ig-square",       platform: "Instagram",    name: "Square Post",        width: 1080, height: 1080 },
  { id: "ig-story",        platform: "Instagram",    name: "Story / TikTok",     width: 1080, height: 1920 },
  { id: "tw-header",       platform: "Twitter/X",    name: "Header",             width: 1500, height: 500  },
  { id: "fb-event",        platform: "Facebook",     name: "Event Cover",        width: 1920, height: 1005 },
  { id: "dc-banner",       platform: "Discord",      name: "Server Banner",      width: 960,  height: 540  },
  { id: "dc-embed",        platform: "Discord",      name: "Embed Image",        width: 1280, height: 720  },
  { id: "hi-res",          platform: "Universal",    name: "High-Res Master",    width: 3840, height: 2160, paid: true },
  { id: "press-kit",       platform: "Universal",    name: "Press Kit (300 DPI)", width: 2550, height: 3300, paid: true },
];

export const FREE_MAX_DIMENSION = 1080;
export const WATERMARK_TEXT = "Made with Dragon Drop Covers";

/**
 * Fraction of the viewport used for the safe zone overlay frame (0–1).
 * The frame is centred and its longest axis fills this proportion of the
 * viewport's constraining dimension.  captureFrame in BookScene uses the
 * same value to decide how much to over-render before cropping, so the
 * exported image exactly matches what's inside the overlay border.
 * Keep both consumers in sync — change here only.
 */
export const SAFE_ZONE_PADDING = 0.88;

export const BOOK_SIZE_LABELS: Record<string, string> = {
  hardcover: "Hardcover",
  softcover: "Softcover",
  digest: "Digest",
  zine: "Zine",
  letter: "Letter / Large",
};

/** Physical aspect ratios (width:height) for each book size */
// [v2.1] Camera presets — positions stored as plain tuples (no THREE imports here;
// this file is imported by server-side code).  BookScene converts to THREE.Vector3.
export const CAMERA_PRESETS = [
  {
    id:          "hero",
    position:    [2.5,  1.2,  5.0] as [number, number, number],
    target:      [0,    0,    0  ] as [number, number, number],
    label:       "Hero",
    icon:        "⭐",
    description: "Classic 3/4 product angle",
  },
  {
    id:          "frontFlat",
    position:    [0,    0,    5.5] as [number, number, number],
    target:      [0,    0,    0  ] as [number, number, number],
    label:       "Front",
    icon:        "🔲",
    description: "Straight-on cover view",
  },
  {
    id:          "dramaticLow",
    position:    [2,   -1.5,  4  ] as [number, number, number],
    target:      [0,    0.5,  0  ] as [number, number, number],
    label:       "Dramatic",
    icon:        "🎬",
    description: "Low angle cinematic",
  },
  {
    id:          "spineFeature",
    position:    [-4,   0.5,  2  ] as [number, number, number],
    target:      [0,    0,    0  ] as [number, number, number],
    label:       "Spine",
    icon:        "📚",
    description: "Spine prominently visible",
  },
  {
    id:          "overhead",
    position:    [0,    6,    2  ] as [number, number, number],
    target:      [0,    0,    0  ] as [number, number, number],
    label:       "Overhead",
    icon:        "🔭",
    description: "Top-down flat lay",
  },
] as const;

// ─── [v2.1 Phase 2] GLTF model map ───────────────────────────────────────────
// Maps each book size to its GLB path.  digest and letter reuse existing models;
// visual proportions are corrected by SCALE_MAP below.
export const MODEL_MAP: Record<BookSize, string> = {
  hardcover: "/models/Hardcover.glb",
  softcover: "/models/Softcover.glb",
  digest:    "/models/Softcover.glb",   // Softcover GLB scaled for digest dimensions
  zine:      "/models/Zine.glb",
  letter:    "/models/Hardcover.glb",   // Hardcover GLB scaled for letter dimensions
};

// Per-size scale applied to the loaded THREE.Group (x, y, z).
// Tune values here after visual inspection — they intentionally use easy-to-read
// multipliers rather than exact physical-to-unit ratios.
// Depth (z) drives spine thickness; xy drive cover proportions.
// [Fix session] Values calibrated after confirming GLTF models load at ~3× over-scale.
export const SCALE_MAP: Record<BookSize, [number, number, number]> = {
  hardcover: [0.35, 0.35, 0.35],
  softcover: [0.35, 0.35, 0.25],
  digest:    [0.30, 0.32, 0.18],
  zine:      [0.30, 0.32, 0.05],
  letter:    [0.42, 0.44, 0.35],
};

// Watermark anchor in book group local space (lower-right area of front face).
// Calibrated initially to match ProceduralBook geometry.
// Re-verify with Hero camera preset after GLTF models are loading:
//   export at free tier, check watermark lands on front cover, adjust here.
export const WATERMARK_COVER_LOCAL: [number, number, number] = [0.4, -0.6, 0.22];

export const BOOK_ASPECT: Record<string, number> = {
  hardcover: 6 / 9,
  softcover: 6 / 9,
  digest: 5.5 / 8.5,
  zine: 5.5 / 8.5,
  letter: 8.5 / 11,
};

// ─── Front cover UV island bounds ────────────────────────────────────────────
// Each GLB has a UV atlas where the front cover occupies a sub-region of [0,1]².
// These bounds are read from the Blender UV editor and confirmed by the
// splitCoverGeometry console output.  Used to scale/offset the cover texture so
// the full image fills the front face rather than rendering zoomed-in.
//
// To apply: repeat = 1/range, offset = -min/range
//   → UV u=uMin samples texture x=0 (left), u=uMax samples x=1 (right)
//
// Softcover/Zine values are copies of Hardcover for now — tune after testing
// those models (splitCoverGeometry logs "front UV u=[...] v=[...]" at load).

export interface FrontUVBounds {
  uMin: number; uMax: number;
  vMin: number; vMax: number;
}

export const HARDCOVER_FRONT_UV: FrontUVBounds = {
  uMin: 0.019, uMax: 0.290,
  vMin: 0.495, vMax: 0.965, // expanded from 0.509/0.951 — shows full top/bottom
};

export const SOFTCOVER_FRONT_UV: FrontUVBounds = {
  uMin: 0.019, uMax: 0.290,
  vMin: 0.509, vMax: 0.951,
}; // TODO: tune after softcover/digest testing

export const ZINE_FRONT_UV: FrontUVBounds = {
  uMin: 0.019, uMax: 0.290,
  vMin: 0.509, vMax: 0.951,
}; // TODO: tune after zine testing

/** Maps each BookSize to its front cover UV island bounds. */
export const FRONT_UV_MAP: Record<BookSize, FrontUVBounds> = {
  hardcover: HARDCOVER_FRONT_UV,
  softcover: SOFTCOVER_FRONT_UV,
  digest:    SOFTCOVER_FRONT_UV,  // reuses Softcover.glb
  zine:      ZINE_FRONT_UV,
  letter:    HARDCOVER_FRONT_UV,  // reuses Hardcover.glb
};
