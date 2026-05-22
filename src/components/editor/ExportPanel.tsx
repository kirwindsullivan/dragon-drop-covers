"use client";

import { useState, useRef, useCallback } from "react";
import { Download, Lock, ChevronDown, ChevronUp } from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { EXPORT_PRESETS, FREE_MAX_DIMENSION, WATERMARK_TEXT } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ExportMode, ExportFormat } from "@/types";

interface ExportPanelProps {
  /** Imperative handle from BookScene for high-res re-render */
  onExport: (width: number, height: number, mode: ExportMode) => Promise<Blob | null>;
}

export function ExportPanel({ onExport }: ExportPanelProps) {
  const exportMode = useEditorStore((s) => s.exportMode);
  const exportFormat = useEditorStore((s) => s.exportFormat);
  const exportPresetId = useEditorStore((s) => s.exportPresetId);
  const customWidth = useEditorStore((s) => s.customWidth);
  const customHeight = useEditorStore((s) => s.customHeight);
  const tier = useEditorStore((s) => s.tier);
  const setExportMode = useEditorStore((s) => s.setExportMode);
  const setExportFormat = useEditorStore((s) => s.setExportFormat);
  const setExportPresetId = useEditorStore((s) => s.setExportPresetId);
  const setCustomDimensions = useEditorStore((s) => s.setCustomDimensions);
  const background = useEditorStore((s) => s.background);
  const textOverlay = useEditorStore((s) => s.textOverlay);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [customW, setCustomW] = useState(customWidth.toString());
  const [customH, setCustomH] = useState(customHeight.toString());

  const selectedPreset = EXPORT_PRESETS.find((p) => p.id === exportPresetId) ?? EXPORT_PRESETS[0];
  const isPaidPreset = selectedPreset.paid;
  const canExport = !isPaidPreset || tier === "paid";

  const isLocked = (preset: typeof EXPORT_PRESETS[0]) =>
    (preset.paid && tier === "free") ||
    (Math.max(preset.width, preset.height) > FREE_MAX_DIMENSION * 1.5 && tier === "free");

  const handleExport = useCallback(async () => {
    if (!canExport) return;
    setExporting(true);

    try {
      let w = selectedPreset.width;
      let h = selectedPreset.height;

      // Cap free tier
      if (tier === "free") {
        const scale = Math.min(1, FREE_MAX_DIMENSION / Math.max(w, h));
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      const blob = await onExport(w, h, exportMode);
      if (!blob) return;

      let finalBlob = blob;

      // Add watermark for free tier
      if (tier === "free") {
        finalBlob = await addWatermark(blob, w, h);
      }

      // Add background for quickpost mode
      if (exportMode === "quickpost") {
        finalBlob = await compositeBackground(finalBlob, w, h, background, textOverlay);
      }

      // Convert to WebP if needed
      if (exportFormat === "webp") {
        finalBlob = await convertToWebP(finalBlob);
      }

      const url = URL.createObjectURL(finalBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dragon-drop-${selectedPreset.id}.${exportFormat}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, [canExport, selectedPreset, tier, onExport, exportMode, exportFormat, background, textOverlay]);

  return (
    <div className="space-y-5">
      {/* Mode selector */}
      <div>
        <label className="label-xs mb-2">Export Mode</label>
        <div className="space-y-2">
          {(
            [
              ["compositing", "Compositing Export", "Transparent PNG with alpha — drop into Photoshop, Canva, Affinity"],
              ["quickpost",   "Quick Post Mode",     "Background included — ready to share to social or Discord"],
              ["shadow-only", "Shadow Only",         "Ground shadow layer only — advanced compositing"],
            ] as [ExportMode, string, string][]
          ).map(([id, label, desc]) => (
            <button
              key={id}
              onClick={() => setExportMode(id)}
              className={cn(
                "w-full text-left rounded-xl border p-3 transition-all",
                exportMode === id
                  ? "border-brand-500 bg-brand-900/50"
                  : "border-surface-3 hover:border-brand-600 bg-surface-1",
              )}
            >
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "h-3.5 w-3.5 rounded-full border-2 transition-colors",
                    exportMode === id
                      ? "border-brand-400 bg-brand-400"
                      : "border-brand-600",
                  )}
                />
                <span className="text-sm font-medium text-white">{label}</span>
              </div>
              <p className="mt-1 ml-5.5 text-xs text-brand-300/60">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Format */}
      <div>
        <label className="label-xs mb-1.5">File Format</label>
        <div className="flex gap-2">
          {(["png", "webp"] as ExportFormat[]).map((fmt) => (
            <button
              key={fmt}
              onClick={() => setExportFormat(fmt)}
              className={cn(
                "flex-1 rounded-lg border py-1.5 text-xs font-mono uppercase transition-all",
                exportFormat === fmt
                  ? "border-brand-500 bg-brand-900/60 text-brand-200"
                  : "border-surface-3 text-brand-300/60 hover:border-brand-600",
              )}
            >
              {fmt}
            </button>
          ))}
        </div>
      </div>

      {/* Preset list */}
      <div>
        <label className="label-xs mb-2">Platform Preset</label>
        <div className="space-y-1 max-h-64 overflow-y-auto pr-1 scrollbar-thin">
          {EXPORT_PRESETS.map((preset) => {
            const locked = isLocked(preset);
            return (
              <button
                key={preset.id}
                onClick={() => !locked && setExportPresetId(preset.id)}
                disabled={locked}
                className={cn(
                  "w-full flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-all",
                  exportPresetId === preset.id && !locked
                    ? "border-brand-500 bg-brand-900/60"
                    : "border-surface-3 hover:border-brand-600 bg-surface-1",
                  locked && "opacity-50 cursor-not-allowed",
                )}
              >
                <div>
                  <span className="text-brand-200 font-medium">{preset.name}</span>
                  <span className="ml-2 text-brand-300/50">{preset.platform}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-brand-300/50">
                    {preset.width}×{preset.height}
                  </span>
                  {locked && <Lock className="h-3 w-3 text-brand-400" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Advanced */}
      <button
        onClick={() => setShowAdvanced((v) => !v)}
        className="flex items-center gap-1 text-xs text-brand-300/50 hover:text-brand-300 transition-colors"
      >
        {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Advanced — custom dimensions
      </button>

      {showAdvanced && (
        <div className="flex gap-2 items-center">
          <input
            type="number"
            value={customW}
            onChange={(e) => setCustomW(e.target.value)}
            onBlur={() => setCustomDimensions(parseInt(customW) || 1920, parseInt(customH) || 1080)}
            className="input-field w-24 font-mono"
            placeholder="1920"
          />
          <span className="text-brand-300/50">×</span>
          <input
            type="number"
            value={customH}
            onChange={(e) => setCustomH(e.target.value)}
            onBlur={() => setCustomDimensions(parseInt(customW) || 1920, parseInt(customH) || 1080)}
            className="input-field w-24 font-mono"
            placeholder="1080"
          />
        </div>
      )}

      {/* Free tier note */}
      {tier === "free" && (
        <p className="text-xs text-brand-300/50 rounded-lg border border-brand-800/40 bg-brand-950/30 p-2">
          Free tier: exports capped at 1080px max, watermarked. Upgrade to unlock full resolution.
        </p>
      )}

      {/* Export button */}
      <button
        onClick={handleExport}
        disabled={exporting || !canExport}
        className={cn(
          "w-full flex items-center justify-center gap-2 rounded-xl py-3 font-semibold text-sm transition-all",
          canExport
            ? "bg-brand-600 hover:bg-brand-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)]"
            : "bg-surface-3 text-brand-300/40 cursor-not-allowed",
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
          </>
        )}
      </button>
    </div>
  );
}

// ─── Canvas compositing helpers ───────────────────────────────────────────────

async function addWatermark(blob: Blob, w: number, h: number): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      ctx.font = `${Math.max(12, w * 0.018)}px sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.textAlign = "right";
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
  textOverlay: { title: string; tagline: string; titleColor: string; taglineColor: string; titleSize: number; taglineSize: number; position: string },
): Promise<Blob> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;

    // Draw background
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

    // Draw book image centered
    const bookUrl = URL.createObjectURL(bookBlob);
    const bookImg = new Image();
    bookImg.onload = () => {
      // Scale book to fit 80% of canvas height
      const scale = (h * 0.8) / bookImg.height;
      const bw = bookImg.width * scale;
      const bh = bookImg.height * scale;
      ctx.drawImage(bookImg, (w - bw) / 2, (h - bh) / 2, bw, bh);
      URL.revokeObjectURL(bookUrl);

      // Draw text overlay
      if (textOverlay.title || textOverlay.tagline) {
        const yPos =
          textOverlay.position === "top"
            ? h * 0.08
            : textOverlay.position === "bottom"
            ? h * 0.85
            : h * 0.5;

        if (textOverlay.title) {
          ctx.font = `bold ${textOverlay.titleSize * (w / 1920)}px serif`;
          ctx.fillStyle = textOverlay.titleColor;
          ctx.textAlign = "center";
          ctx.fillText(textOverlay.title, w / 2, yPos);
        }

        if (textOverlay.tagline) {
          ctx.font = `${textOverlay.taglineSize * (w / 1920)}px serif`;
          ctx.fillStyle = textOverlay.taglineColor;
          ctx.textAlign = "center";
          ctx.fillText(textOverlay.tagline, w / 2, yPos + textOverlay.titleSize * 1.4 * (w / 1920));
        }
      }

      canvas.toBlob((b) => resolve(b!), "image/png");
    };
    bookImg.src = bookUrl;
  });
}

async function convertToWebP(blob: Blob): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => resolve(b!), "image/webp", 0.92);
    };
    img.src = url;
  });
}
