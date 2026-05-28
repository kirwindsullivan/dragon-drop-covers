export type BookSize =
  | "hardcover"
  | "softcover"
  | "digest"
  | "zine"
  | "letter";

export type BackgroundMode = "solid" | "gradient" | "image";

export interface BackgroundPreset {
  id: string;
  name: string;
  mode: BackgroundMode;
  /** CSS color or gradient value, or URL for image mode */
  value: string;
  /** Second stop for gradients */
  value2?: string;
  angle?: number;
}

export interface MoodPreset {
  id: string;
  name: string;
  brightness: number;
  contrast: number;
  saturation: number;
  vignette: number;
}

export interface LightingState {
  /** 0–1 normalized pad position, maps to azimuth/elevation */
  padX: number;
  padY: number;
  ambientIntensity: number;
  pointIntensity: number;
}

export interface PhotoAdjustments {
  brightness: number;   // -1 to 1
  contrast: number;     // -1 to 1
  saturation: number;   // -1 to 1
  vignette: number;     // 0 to 1
}

export interface TextOverlay {
  title: string;
  tagline: string;
  logoUrl: string | null;
  titleColor: string;
  taglineColor: string;
  titleSize: number;
  taglineSize: number;
  position: "top" | "center" | "bottom";
}

export type ExportMode = "compositing" | "quickpost" | "shadow-only";

export type ExportFormat = "png" | "webp";

export interface ExportPreset {
  id: string;
  platform: string;
  name: string;
  width: number;
  height: number;
  paid?: boolean;
  icon?: string;
}

export type AccountTier = "free" | "paid";

// [v2.1] Material finish
export type FinishType = "matte" | "satin" | "gloss";

// [v2.1] Atmospheric effects
export type AtmosphericEffectType = "none" | "mist" | "dust" | "rain";

// [Session 5] Export history — one entry per completed export, stored in Zustand.
// projectId links history to the current project so entries are filtered per project.
export interface ExportHistoryItem {
  id: string;
  presetId: string;
  presetName: string;
  format: "png" | "webp";
  timestamp: number;   // Date.now() at time of export
  r2Key: string;       // Used to regenerate a fresh signed download URL
  projectId: string | null;
}

export interface EditorState {
  // Book
  bookSize: BookSize;
  coverImageUrl: string | null;   // local blob URL or R2 signed read URL
  coverImageFile: File | null;
  coverR2Key: string | null;      // R2 object key — null until uploaded
  spineTitle: string;

  // Background
  background: BackgroundPreset;

  // Lighting
  lighting: LightingState;

  // Photo adjustments
  photo: PhotoAdjustments;

  // Text overlay
  textOverlay: TextOverlay;

  // Export
  exportMode: ExportMode;
  exportFormat: ExportFormat;
  exportPresetId: string;
  customWidth: number;
  customHeight: number;

  // Camera
  autoRotate: boolean;

  // UI state
  activePanel: "cover" | "background" | "lighting" | "adjust" | "text" | "export";

  // Account
  tier: AccountTier;

  // [Session 4] Project context — null when using standalone /editor
  projectId: string | null;
  projectTier: "free" | "project_pass" | "pro" | null;

  // [Session 5] Safe zone overlay
  showRuleOfThirds: boolean;
  // [Session 5] Export history — last N exports across all projects
  exportHistory: ExportHistoryItem[];

  // [v2.1] Scene & interaction upgrades
  finish: FinishType;
  hdriIntensity: number;           // 0–2.0; maps to renderer.toneMappingExposure
  atmosphericEffect: AtmosphericEffectType;
  atmosphericIntensity: number;    // 0–100
  activeCameraPreset: string | null;
  /** Monotonically increasing counter — increment to trigger camera animation */
  _cameraAnimVersion: number;
}
