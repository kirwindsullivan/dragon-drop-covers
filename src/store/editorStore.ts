import { create } from "zustand";
import type {
  EditorState,
  BookSize,
  BackgroundPreset,
  LightingState,
  PhotoAdjustments,
  TextOverlay,
  ExportMode,
  ExportFormat,
  MoodPreset,
  ExportHistoryItem, // [Session 5]
  FinishType,          // [v2.1]
  AtmosphericEffectType, // [v2.1]
} from "@/types";

const DEFAULT_BACKGROUND: BackgroundPreset = {
  id: "arcane-night",
  name: "Arcane Night",
  mode: "gradient",
  value: "#0d001a",
  value2: "#1a0040",
  angle: 135,
};

const DEFAULT_LIGHTING: LightingState = {
  padX: 0.65,
  padY: 0.35,
  // [v2.1] Reduced to ~60% of original 0.6 so HDRI + point light feel balanced
  ambientIntensity: 0.35,
  pointIntensity: 2.5,
};

const DEFAULT_PHOTO: PhotoAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  vignette: 0.3,
};

const DEFAULT_TEXT: TextOverlay = {
  title: "",
  tagline: "",
  logoUrl: null,
  titleColor: "#ffffff",
  taglineColor: "#d1b8ff",
  titleSize: 48,
  taglineSize: 24,
  position: "bottom",
};

export const MOOD_PRESETS: MoodPreset[] = [
  { id: "cinematic", name: "Cinematic", brightness: -0.05, contrast: 0.2,  saturation: -0.1, vignette: 0.55 },
  { id: "warm",      name: "Warm",      brightness: 0.05,  contrast: 0.05, saturation: 0.2,  vignette: 0.25 },
  { id: "cold",      name: "Cold",      brightness: -0.05, contrast: 0.1,  saturation: -0.3, vignette: 0.35 },
  { id: "faded",     name: "Faded",     brightness: 0.1,   contrast: -0.2, saturation: -0.4, vignette: 0.1  },
];

interface Actions {
  // [v2.1] Scene upgrades
  setFinish: (finish: FinishType) => void;
  setHdriIntensity: (v: number) => void;
  setAtmosphericEffect: (effect: AtmosphericEffectType) => void;
  setAtmosphericIntensity: (v: number) => void;
  setActiveCameraPreset: (id: string | null) => void;
  /** Animate camera to preset — increments _cameraAnimVersion to trigger BookScene animation */
  animateCamera: (presetId: string) => void;
  setBookSize: (size: BookSize) => void;
  setCoverImage: (url: string | null, file: File | null, r2Key?: string | null) => void;
  setCoverR2Key: (key: string | null) => void;
  setSpineTitle: (title: string) => void;
  setBackground: (bg: BackgroundPreset) => void;
  setLighting: (l: Partial<LightingState>) => void;
  setPhoto: (p: Partial<PhotoAdjustments>) => void;
  applyMoodPreset: (preset: MoodPreset) => void;
  setTextOverlay: (t: Partial<TextOverlay>) => void;
  setExportMode: (mode: ExportMode) => void;
  setExportFormat: (fmt: ExportFormat) => void;
  setExportPresetId: (id: string) => void;
  setCustomDimensions: (w: number, h: number) => void;
  setAutoRotate: (v: boolean) => void;
  setActivePanel: (panel: EditorState["activePanel"]) => void;
  // [Session 4] Project context actions
  setProjectId: (id: string | null) => void;
  setProjectTier: (tier: "free" | "project_pass" | "pro" | null) => void;
  /** Reset all editor state to defaults (cover, settings, active panel, etc.)
   *  Called when entering a new or different project so nothing bleeds through. */
  resetEditorState: () => void;
  // [Session 5] Safe zone overlay
  setShowRuleOfThirds: (v: boolean) => void;
  // [Session 5] Export history — keeps last 20 items across projects
  addExportHistory: (item: ExportHistoryItem) => void;
}

const initialState: EditorState = {
  bookSize: "hardcover",
  coverImageUrl: null,
  coverImageFile: null,
  coverR2Key: null,
  spineTitle: "",
  background: DEFAULT_BACKGROUND,
  lighting: DEFAULT_LIGHTING,
  photo: DEFAULT_PHOTO,
  textOverlay: DEFAULT_TEXT,
  exportMode: "compositing",
  exportFormat: "png",
  exportPresetId: "ks-header",
  customWidth: 1920,
  customHeight: 1080,
  autoRotate: false,
  activePanel: "cover",
  tier: "free",
  // [Session 4] Project context
  projectId: null,
  projectTier: null,
  // [Session 5] Safe zone / export history
  showRuleOfThirds: false,
  exportHistory: [] as ExportHistoryItem[],

  // [v2.1] Scene upgrades
  finish:               "matte" as FinishType,
  hdriIntensity:        1.0,
  atmosphericEffect:    "none" as AtmosphericEffectType,
  atmosphericIntensity: 50,
  activeCameraPreset:   null,
  _cameraAnimVersion:   0,
};

export const useEditorStore = create<EditorState & Actions>()((set) => ({
  ...initialState,

  // [v2.1] Scene upgrade actions
  setFinish: (finish) => set({ finish }),
  setHdriIntensity: (hdriIntensity) => set({ hdriIntensity }),
  setAtmosphericEffect: (atmosphericEffect) => set({ atmosphericEffect }),
  setAtmosphericIntensity: (atmosphericIntensity) => set({ atmosphericIntensity }),
  setActiveCameraPreset: (activeCameraPreset) => set({ activeCameraPreset }),
  animateCamera: (presetId) =>
    set((s) => ({
      activeCameraPreset:  presetId,
      _cameraAnimVersion:  s._cameraAnimVersion + 1,
    })),

  setBookSize: (bookSize) => set({ bookSize }),
  setCoverImage: (coverImageUrl, coverImageFile, r2Key) =>
    set({ coverImageUrl, coverImageFile, coverR2Key: r2Key ?? null }),
  setCoverR2Key: (coverR2Key) => set({ coverR2Key }),
  setSpineTitle: (spineTitle) => set({ spineTitle }),
  setBackground: (background) => set({ background }),

  setLighting: (l) =>
    set((s) => ({ lighting: { ...s.lighting, ...l } })),

  setPhoto: (p) =>
    set((s) => ({ photo: { ...s.photo, ...p } })),

  applyMoodPreset: (preset) =>
    set((s) => ({
      photo: {
        ...s.photo,
        brightness: preset.brightness,
        contrast: preset.contrast,
        saturation: preset.saturation,
        vignette: preset.vignette,
      },
    })),

  setTextOverlay: (t) =>
    set((s) => ({ textOverlay: { ...s.textOverlay, ...t } })),

  setExportMode: (exportMode) => set({ exportMode }),
  setExportFormat: (exportFormat) => set({ exportFormat }),
  setExportPresetId: (exportPresetId) => set({ exportPresetId }),
  setCustomDimensions: (customWidth, customHeight) => set({ customWidth, customHeight }),
  setAutoRotate: (autoRotate) => set({ autoRotate }),
  setActivePanel: (activePanel) => set({ activePanel }),
  // [Session 4] Project context
  setProjectId: (projectId) => set({ projectId }),
  setProjectTier: (projectTier) => set({ projectTier }),

  // [Session 5] Safe zone
  setShowRuleOfThirds: (showRuleOfThirds) => set({ showRuleOfThirds }),

  // [Session 5] Export history — prepend latest, keep 20 max
  addExportHistory: (item) =>
    set((s) => ({
      exportHistory: [item, ...s.exportHistory].slice(0, 20),
    })),

  // Reset all editor state to defaults — does NOT touch projectId / projectTier
  // (those are set separately by the builder page after this reset runs).
  resetEditorState: () =>
    set({
      bookSize:       initialState.bookSize,
      coverImageUrl:  initialState.coverImageUrl,
      coverImageFile: initialState.coverImageFile,
      coverR2Key:     initialState.coverR2Key,
      spineTitle:     initialState.spineTitle,
      background:     initialState.background,
      lighting:       initialState.lighting,
      photo:          initialState.photo,
      textOverlay:    initialState.textOverlay,
      exportMode:     initialState.exportMode,
      exportFormat:   initialState.exportFormat,
      exportPresetId: initialState.exportPresetId,
      customWidth:    initialState.customWidth,
      customHeight:   initialState.customHeight,
      autoRotate:          initialState.autoRotate,
      activePanel:         initialState.activePanel,      // resets to "cover"
      showRuleOfThirds:    initialState.showRuleOfThirds, // [Session 5]
      // exportHistory intentionally NOT reset — history persists across projects
      // [v2.1] Scene upgrades
      finish:               initialState.finish,
      hdriIntensity:        initialState.hdriIntensity,
      atmosphericEffect:    initialState.atmosphericEffect,
      atmosphericIntensity: initialState.atmosphericIntensity,
      activeCameraPreset:   initialState.activeCameraPreset,
      // _cameraAnimVersion intentionally NOT reset — animation signals don't leak
    }),
}));
