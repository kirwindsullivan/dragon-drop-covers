"use client";

// [Session 2] Original file — R2 presigned upload/download flow.
// [Session 3] Added tier gating — Pro presets locked, watermark for Free.
// [Session 4] Added project tier override (project_pass unlocks presets).
// [Session 5] UI overhaul: prominent mode toggle, grouped preset list,
//             format descriptions, shadow-only gate, cap notice,
//             export history with re-download.
//             All existing export logic is PRESERVED — only JSX layout changed.

import { useState, useCallback, useMemo } from "react";
import {
  Download, Lock, ChevronDown, ChevronUp,
  Layers, Image, Zap, Clock, RefreshCw,
} from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { useEditorStore } from "@/store/editorStore";
import { EXPORT_PRESETS, WATERMARK_TEXT } from "@/lib/constants";
import { getTierFromUser, canUsePreset, capDimensions, TIER_LIMITS } from "@/lib/tier";
import type { UserTier } from "@/lib/tier";
import { UpgradeOptionsModal } from "@/components/billing/UpgradeOptionsModal";
import { cn } from "@/lib/utils";
import type { ExportMode, ExportFormat, ExportHistoryItem } from "@/types";

interface ExportPanelProps {
  onExport: (width: number, height: number, mode: ExportMode) => Promise<Blob | null>;
}

// ── Platform metadata (colors + abbreviation for group icons) ─────────────────

const PLATFORM_META: Record<string, { abbr: string; cls: string }> = {
  "Kickstarter": { abbr: "KS", cls: "bg-green-900/40  text-green-400"  },
  "BackerKit":   { abbr: "BK", cls: "bg-sky-900/40    text-sky-400"    },
  "Instagram":   { abbr: "IG", cls: "bg-pink-900/40   text-pink-400"   },
  "Twitter/X":   { abbr: "X",  cls: "bg-slate-800/60  text-slate-300"  },
  "Facebook":    { abbr: "FB", cls: "bg-blue-900/40   text-blue-400"   },
  "Discord":     { abbr: "DC", cls: "bg-indigo-900/40 text-indigo-400" },
  "Universal":   { abbr: "★",  cls: "bg-brand-900/40  text-brand-400"  },
};

// ── Export Panel ──────────────────────────────────────────────────────────────

export function ExportPanel({ onExport }: ExportPanelProps) {

  // ── Tier resolution ──────────────────────────────────────────────────────
  // [Session 4] Project tier overrides user account tier in builder context.
  const { user } = useUser();
  const projectTier = useEditorStore((s) => s.projectTier);
  const tier: UserTier = projectTier ?? getTierFromUser(user);

  // ── Editor state ─────────────────────────────────────────────────────────
  const exportMode     = useEditorStore((s) => s.exportMode);
  const exportFormat   = useEditorStore((s) => s.exportFormat);
  const exportPresetId = useEditorStore((s) => s.exportPresetId);
  const customWidth    = useEditorStore((s) => s.customWidth);
  const customHeight   = useEditorStore((s) => s.customHeight);
  const background     = useEditorStore((s) => s.background);
  const textOverlay    = useEditorStore((s) => s.textOverlay);
  const projectId      = useEditorStore((s) => s.projectId);
  const exportHistory  = useEditorStore((s) => s.exportHistory);
  const addExportHistory = useEditorStore((s) => s.addExportHistory);

  const setExportMode        = useEditorStore((s) => s.setExportMode);
  const setExportFormat      = useEditorStore((s) => s.setExportFormat);
  const setExportPresetId    = useEditorStore((s) => s.setExportPresetId);
  const setCustomDimensions  = useEditorStore((s) => s.setCustomDimensions);

  // ── Local UI state ───────────────────────────────────────────────────────
  const [showAdvanced,  setShowAdvanced]  = useState(false);
  const [exporting,     setExporting]     = useState(false);
  const [customW,       setCustomW]       = useState(customWidth.toString());
  const [customH,       setCustomH]       = useState(customHeight.toString());
  /** Preset name shown in the upgrade modal, or null when closed */
  const [upgradePreset, setUpgradePreset] = useState<string | null>(null);
  const [reDownloading, setReDownloading] = useState<string | null>(null);

  // ── Derived values ───────────────────────────────────────────────────────
  const selectedPreset = EXPORT_PRESETS.find((p) => p.id === exportPresetId) ?? EXPORT_PRESETS[0];

  const isLocked = (preset: typeof EXPORT_PRESETS[0]) => !canUsePreset(tier, preset.paid === true);

  const { width: cappedW, height: cappedH } = capDimensions(
    selectedPreset.width, selectedPreset.height, tier,
  );
  const isCapped = cappedW < selectedPreset.width || cappedH < selectedPreset.height;

  // Group presets by platform, preserving insertion order
  const presetGroups = useMemo(() => {
    const map = new Map<string, typeof EXPORT_PRESETS>();
    for (const p of EXPORT_PRESETS) {
      if (!map.has(p.platform)) map.set(p.platform, []);
      map.get(p.platform)!.push(p);
    }
    return [...map.entries()];
  }, []);

  // Current project's export history, most-recent first, last 5
  const projectHistory = useMemo(
    () => exportHistory.filter((e) => e.projectId === projectId).slice(0, 5),
    [exportHistory, projectId],
  );

  // ── Export handler (unchanged from Session 2/3/4) ────────────────────────
  const handleExport = useCallback(async () => {
    if (isLocked(selectedPreset)) {
      setUpgradePreset(selectedPreset.name);
      return;
    }
    setExporting(true);
    try {
      const { width: w, height: h } = capDimensions(
        selectedPreset.width, selectedPreset.height, tier,
      );

      const blob = await onExport(w, h, exportMode);
      if (!blob) return;

      let finalBlob = blob;

      // [Session 3] Watermark for free tier
      if (TIER_LIMITS[tier].watermark) {
        finalBlob = await addWatermark(finalBlob, w, h);
      }

      // Composite background for quickpost mode
      if (exportMode === "quickpost") {
        finalBlob = await compositeBackground(finalBlob, w, h, background, textOverlay);
      }

      // Convert to WebP if requested
      if (exportFormat === "webp") {
        finalBlob = await convertToWebP(finalBlob);
      }

      // ── Upload to R2 and download via signed URL ──────────────────────
      try {
        const res = await fetch("/api/upload/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ presetId: selectedPreset.id, format: exportFormat }),
        });
        if (!res.ok) throw new Error(`API ${res.status}`);
        const { uploadUrl, downloadUrl, key } = await res.json() as {
          uploadUrl: string;
          downloadUrl: string;
          key: string;
        };

        await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": finalBlob.type },
          body: finalBlob,
        });

        // [Session 5] Record in export history before triggering download
        if (key) {
          addExportHistory({
            id: crypto.randomUUID(),
            presetId:   selectedPreset.id,
            presetName: selectedPreset.name,
            format:     exportFormat,
            timestamp:  Date.now(),
            r2Key:      key,
            projectId,
          });
        }

        const a = document.createElement("a");
        a.href     = downloadUrl;
        a.download = `dragon-drop-${selectedPreset.id}.${exportFormat}`;
        a.click();
      } catch (r2Err) {
        // R2 not configured — fall back to local download
        console.warn("R2 export upload failed, using local download:", r2Err);
        const url = URL.createObjectURL(finalBlob);
        const a   = document.createElement("a");
        a.href     = url;
        a.download = `dragon-drop-${selectedPreset.id}.${exportFormat}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPreset, tier, onExport, exportMode, exportFormat, background, textOverlay, projectId, addExportHistory]);

  // ── Re-download handler (Session 5) ─────────────────────────────────────
  const handleReDownload = useCallback(async (item: ExportHistoryItem) => {
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    if (Date.now() - item.timestamp > TWENTY_FOUR_HOURS) return;

    setReDownloading(item.id);
    try {
      const res = await fetch(
        `/api/upload/signed-url?key=${encodeURIComponent(item.r2Key)}`,
      );
      const { readUrl } = await res.json() as { readUrl?: string };
      if (readUrl) {
        const a   = document.createElement("a");
        a.href     = readUrl;
        a.download = `dragon-drop-${item.presetId}.${item.format}`;
        a.click();
      }
    } catch (e) {
      console.error("Re-download failed:", e);
    } finally {
      setReDownloading(null);
    }
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* Upgrade modal */}
      {upgradePreset && (
        <UpgradeOptionsModal
          onClose={() => setUpgradePreset(null)}
          heading={`Unlock "${upgradePreset}"`}
          subheading="This export preset requires a Project Pass or Pro subscription."
        />
      )}

      <div className="space-y-5">

        {/* ── 1. Export Mode ─────────────────────────────────────────────── */}
        <div>
          <label className="label-xs mb-2">Export Mode</label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["compositing", "Compositing", Layers,
                  "Transparent background — drop into Photoshop, Canva, or Affinity"],
                ["quickpost", "Quick Post", Image,
                  "Background included — ready to share to social or Discord"],
              ] as [ExportMode, string, typeof Layers, string][]
            ).map(([id, label, Icon, desc]) => (
              <button
                key={id}
                onClick={() => setExportMode(id)}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all",
                  exportMode === id
                    ? "border-brand-500 bg-brand-900/50"
                    : "border-surface-3 hover:border-brand-600 bg-surface-1",
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon className={cn(
                    "h-4 w-4 shrink-0",
                    exportMode === id ? "text-brand-400" : "text-brand-500/60",
                  )} />
                  <span className="text-xs font-semibold text-white">{label}</span>
                </div>
                <p className="text-[10px] text-brand-300/50 leading-snug">{desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* ── 2. Platform presets ────────────────────────────────────────── */}
        <div>
          <label className="label-xs mb-2">Platform Preset</label>
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
            {presetGroups.map(([platform, presets]) => {
              const meta = PLATFORM_META[platform] ?? { abbr: platform.slice(0, 2).toUpperCase(), cls: "bg-surface-3 text-brand-300" };
              return (
                <div key={platform}>
                  {/* Group header */}
                  <div className="flex items-center gap-2 mb-1.5 px-0.5">
                    <span className={cn(
                      "inline-flex h-5 w-7 items-center justify-center rounded text-[9px] font-bold tracking-wide",
                      meta.cls,
                    )}>
                      {meta.abbr}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-300/50">
                      {platform}
                    </span>
                  </div>

                  {/* Presets in this group */}
                  <div className="space-y-1">
                    {presets.map((preset) => {
                      const locked = isLocked(preset);
                      return (
                        <button
                          key={preset.id}
                          onClick={() => {
                            if (locked) setUpgradePreset(preset.name);
                            else setExportPresetId(preset.id);
                          }}
                          className={cn(
                            "w-full flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-all",
                            exportPresetId === preset.id && !locked
                              ? "border-brand-500 bg-brand-900/60"
                              : "border-surface-3 hover:border-brand-600 bg-surface-1",
                            locked && "opacity-60",
                          )}
                        >
                          <span className="font-medium text-brand-200">
                            {preset.name}
                          </span>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="font-mono text-[10px] text-brand-300/50">
                              {preset.width}×{preset.height}
                            </span>
                            {locked && <Lock className="h-3 w-3 text-brand-400" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 3. File format ─────────────────────────────────────────────── */}
        <div>
          <label className="label-xs mb-2">File Format</label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["png",  "PNG",  "Lossless · full alpha · best for compositing"],
                ["webp", "WebP", "Smaller file · alpha supported · best for web"],
              ] as [ExportFormat, string, string][]
            ).map(([fmt, label, desc]) => (
              <button
                key={fmt}
                onClick={() => setExportFormat(fmt)}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-all",
                  exportFormat === fmt
                    ? "border-brand-500 bg-brand-900/50"
                    : "border-surface-3 hover:border-brand-600 bg-surface-1",
                )}
              >
                <span className="font-mono text-sm font-semibold text-white uppercase">
                  {label}
                </span>
                <span className="text-[10px] text-brand-300/50 leading-snug">{desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── 4. Advanced ────────────────────────────────────────────────── */}
        <div>
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1 text-xs text-brand-300/50 hover:text-brand-300 transition-colors"
          >
            {showAdvanced
              ? <ChevronUp className="h-3 w-3" />
              : <ChevronDown className="h-3 w-3" />}
            Advanced options
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-4">
              {/* Custom dimensions */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-300/50 mb-1.5">
                  Custom dimensions
                </p>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    value={customW}
                    min={100} max={3840}
                    onChange={(e) => setCustomW(e.target.value)}
                    onBlur={() => {
                      const w = Math.min(3840, Math.max(100, parseInt(customW) || 1920));
                      const h = Math.min(3840, Math.max(100, parseInt(customH) || 1080));
                      setCustomW(String(w));
                      setCustomH(String(h));
                      setCustomDimensions(w, h);
                    }}
                    className="input-field w-24 font-mono"
                    placeholder="1920"
                  />
                  <span className="text-brand-300/50">×</span>
                  <input
                    type="number"
                    value={customH}
                    min={100} max={3840}
                    onChange={(e) => setCustomH(e.target.value)}
                    onBlur={() => {
                      const w = Math.min(3840, Math.max(100, parseInt(customW) || 1920));
                      const h = Math.min(3840, Math.max(100, parseInt(customH) || 1080));
                      setCustomW(String(w));
                      setCustomH(String(h));
                      setCustomDimensions(w, h);
                    }}
                    className="input-field w-24 font-mono"
                    placeholder="1080"
                  />
                </div>
                <p className="text-[10px] text-brand-300/40 mt-1">
                  Min 100px · Max 3840px · Capped at 1080p for Free / Project Pass
                </p>
              </div>

              {/* Shadow-only — Pro only */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-300/50 mb-1.5">
                  Shadow layer export
                </p>
                <button
                  onClick={() => {
                    if (tier !== "pro") {
                      setUpgradePreset("Shadow Only");
                      return;
                    }
                    setExportMode(exportMode === "shadow-only" ? "compositing" : "shadow-only");
                  }}
                  className={cn(
                    "w-full flex items-center justify-between rounded-xl border p-3 text-left text-xs transition-all",
                    exportMode === "shadow-only"
                      ? "border-brand-500 bg-brand-900/50"
                      : "border-surface-3 hover:border-brand-600 bg-surface-1",
                    tier !== "pro" && "opacity-60",
                  )}
                >
                  <div>
                    <span className="font-medium text-brand-200">Shadow Only</span>
                    <p className="text-[10px] text-brand-300/50 mt-0.5">
                      For advanced compositing — exports shadow layer only
                    </p>
                  </div>
                  {tier !== "pro"
                    ? <Lock className="h-3.5 w-3.5 text-brand-400 shrink-0 ml-2" />
                    : exportMode === "shadow-only"
                    ? <Zap className="h-3.5 w-3.5 text-brand-400 shrink-0 ml-2" />
                    : null
                  }
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── 5. Resolution cap notice ────────────────────────────────────── */}
        {isCapped && tier !== "pro" && (
          <p className="text-[10px] text-amber-400/80 rounded-lg border border-amber-800/30 bg-amber-950/20 p-2">
            Exported at {cappedW}×{cappedH} (1080p max) — upgrade to Pro for full {selectedPreset.width}×{selectedPreset.height}.
          </p>
        )}

        {/* ── 6. Export button ───────────────────────────────────────────── */}
        <button
          onClick={handleExport}
          disabled={exporting}
          className={cn(
            "w-full flex items-center justify-center gap-2 rounded-xl py-3 font-semibold text-sm transition-all",
            "bg-brand-600 hover:bg-brand-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)]",
            exporting && "opacity-70 cursor-not-allowed",
          )}
        >
          {exporting ? (
            <>
              <span className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Rendering…
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Export {selectedPreset.name}
              {isLocked(selectedPreset) && <Lock className="h-3.5 w-3.5 ml-1" />}
            </>
          )}
        </button>

        {/* ── 7. Export history ──────────────────────────────────────────── */}
        {projectHistory.length > 0 && (
          <div>
            <label className="label-xs mb-2 flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Recent exports
            </label>
            <div className="space-y-1.5">
              {projectHistory.map((item) => {
                const expired = Date.now() - item.timestamp > 24 * 60 * 60 * 1000;
                const age     = formatAge(item.timestamp);
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-surface-3 bg-surface-1 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-brand-200 truncate">
                        {item.presetName}
                      </p>
                      <p className="text-[10px] text-brand-300/40">
                        {item.format.toUpperCase()} · {age}
                      </p>
                    </div>
                    <button
                      onClick={() => !expired && handleReDownload(item)}
                      disabled={expired || reDownloading === item.id}
                      className={cn(
                        "ml-2 shrink-0 flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium transition-all",
                        expired
                          ? "text-brand-300/30 cursor-default"
                          : "border border-surface-3 text-brand-300 hover:border-brand-600 hover:text-white",
                      )}
                      title={expired ? "Download link expired (>24h)" : "Re-download"}
                    >
                      {reDownloading === item.id ? (
                        <span className="inline-block h-3 w-3 rounded-full border border-white/30 border-t-white animate-spin" />
                      ) : expired ? (
                        "Expired"
                      ) : (
                        <><RefreshCw className="h-3 w-3" /> DL</>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </>
  );
}

// ── Time formatting helper ────────────────────────────────────────────────────

function formatAge(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Canvas compositing helpers (unchanged from Sessions 2/3/4) ────────────────

async function addWatermark(blob: Blob, w: number, h: number): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      ctx.font      = `${Math.max(12, w * 0.018)}px sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.textAlign    = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(WATERMARK_TEXT, w - 12, h - 12);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => resolve(b!), "image/png");
    };
    img.src = url;
  });
}

async function compositeBackground(
  bookBlob: Blob,
  w: number,
  h: number,
  background: { mode: string; value: string; value2?: string; angle?: number },
  textOverlay: {
    title: string; tagline: string;
    titleColor: string; taglineColor: string;
    titleSize: number; taglineSize: number;
    position: string;
  },
): Promise<Blob> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;

    if (background.mode === "gradient") {
      const angle = ((background.angle ?? 135) * Math.PI) / 180;
      const x1 = w / 2 - Math.cos(angle) * w;
      const y1 = h / 2 - Math.sin(angle) * h;
      const x2 = w / 2 + Math.cos(angle) * w;
      const y2 = h / 2 + Math.sin(angle) * h;
      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      grad.addColorStop(0, background.value);
      grad.addColorStop(1, background.value2 ?? background.value);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = background.value;
    }
    ctx.fillRect(0, 0, w, h);

    const bookUrl = URL.createObjectURL(bookBlob);
    const bookImg = new window.Image();
    bookImg.onload = () => {
      const scale = (h * 0.8) / bookImg.height;
      const bw = bookImg.width * scale;
      const bh = bookImg.height * scale;
      ctx.drawImage(bookImg, (w - bw) / 2, (h - bh) / 2, bw, bh);
      URL.revokeObjectURL(bookUrl);

      if (textOverlay.title || textOverlay.tagline) {
        const yPos =
          textOverlay.position === "top"    ? h * 0.08
          : textOverlay.position === "bottom" ? h * 0.85
          : h * 0.5;
        if (textOverlay.title) {
          ctx.font      = `bold ${textOverlay.titleSize * (w / 1920)}px serif`;
          ctx.fillStyle = textOverlay.titleColor;
          ctx.textAlign = "center";
          ctx.fillText(textOverlay.title, w / 2, yPos);
        }
        if (textOverlay.tagline) {
          ctx.font      = `${textOverlay.taglineSize * (w / 1920)}px serif`;
          ctx.fillStyle = textOverlay.taglineColor;
          ctx.textAlign = "center";
          ctx.fillText(
            textOverlay.tagline, w / 2,
            yPos + textOverlay.titleSize * 1.4 * (w / 1920),
          );
        }
      }

      canvas.toBlob((b) => resolve(b!), "image/png");
    };
    bookImg.src = bookUrl;
  });
}

async function convertToWebP(blob: Blob): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = img.width;
      canvas.height = img.height;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => resolve(b!), "image/webp", 0.92);
    };
    img.src = url;
  });
}
