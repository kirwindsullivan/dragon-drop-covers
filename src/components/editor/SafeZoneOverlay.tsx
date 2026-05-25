"use client";

// [Session 5] Safe zone overlay — drawn as an HTML canvas layered on top of the
// Three.js canvas so it is completely separate from the WebGL renderer and can
// never appear in exported images.
//
// Shows:
//  • A dark vignette (25% opacity) outside the export frame
//  • A 1.5px white border (60% opacity) marking the export boundary
//  • A label pill at the top-left corner: "Preset name — WxH"
//  • An optional rule-of-thirds grid (white 20% opacity, toggled by a corner button)
//
// The component is placed as a direct child of the "relative flex-1 overflow-hidden"
// viewport div in the builder page — it uses "absolute inset-0" to match that div.

import { useEffect, useRef, useState, useCallback } from "react";
import { Grid3X3 } from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { EXPORT_PRESETS } from "@/lib/constants";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Draw a rounded rectangle path on a 2D canvas context. */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SafeZoneOverlay() {
  const exportPresetId = useEditorStore((s) => s.exportPresetId);
  const showGrid       = useEditorStore((s) => s.showRuleOfThirds);
  const setShowGrid    = useEditorStore((s) => s.setShowRuleOfThirds);

  const wrapRef   = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Track the container's pixel dimensions so we can redraw on resize
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  const preset = EXPORT_PRESETS.find((p) => p.id === exportPresetId) ?? EXPORT_PRESETS[0];

  // ResizeObserver keeps containerSize in sync with the viewport div
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: width, h: height });
    });
    ro.observe(el);
    // Measure immediately so the first render isn't blank
    const { width, height } = el.getBoundingClientRect();
    setContainerSize({ w: width, h: height });
    return () => ro.disconnect();
  }, []);

  // Redraw whenever anything visual changes
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w: cw, h: ch } = containerSize;
    if (cw === 0 || ch === 0) return;

    // Size the canvas to match its container (1:1 physical pixels)
    canvas.width  = cw;
    canvas.height = ch;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);

    // ── Calculate the export frame rectangle ──────────────────────────────
    // Largest rectangle with the preset's aspect ratio that fits in the
    // container with a little breathing room around the edges.
    const PADDING = 0.88; // use 88% of each container axis
    const presetRatio = preset.width / preset.height;
    const containerRatio = cw / ch;

    let fw: number, fh: number;
    if (containerRatio > presetRatio) {
      // Container is wider than preset → height is the constraint
      fh = ch * PADDING;
      fw = fh * presetRatio;
    } else {
      // Container is taller → width is the constraint
      fw = cw * PADDING;
      fh = fw / presetRatio;
    }
    const fx = (cw - fw) / 2;
    const fy = (ch - fh) / 2;

    // ── Dark vignette outside the frame ──────────────────────────────────
    // Fill the whole canvas, then "punch out" the frame interior using
    // destination-out composite so the frame is fully transparent.
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillRect(fx, fy, fw, fh);
    ctx.restore();

    // ── Frame border ──────────────────────────────────────────────────────
    ctx.strokeStyle = "rgba(255, 255, 255, 0.60)";
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(fx, fy, fw, fh);

    // ── Rule-of-thirds grid ───────────────────────────────────────────────
    if (showGrid) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.20)";
      ctx.lineWidth   = 1;
      ctx.beginPath();
      // Two vertical lines
      ctx.moveTo(fx + fw / 3,       fy);      ctx.lineTo(fx + fw / 3,       fy + fh);
      ctx.moveTo(fx + (fw * 2) / 3, fy);      ctx.lineTo(fx + (fw * 2) / 3, fy + fh);
      // Two horizontal lines
      ctx.moveTo(fx,      fy + fh / 3);       ctx.lineTo(fx + fw, fy + fh / 3);
      ctx.moveTo(fx,      fy + (fh * 2) / 3); ctx.lineTo(fx + fw, fy + (fh * 2) / 3);
      ctx.stroke();
      ctx.restore();
    }

    // ── Label pill ────────────────────────────────────────────────────────
    const label = `${preset.name} — ${preset.width}×${preset.height}`;
    const FONT  = "bold 11px system-ui, -apple-system, sans-serif";
    ctx.font    = FONT;
    const textW = ctx.measureText(label).width;
    const PAD   = 7;
    const PILL_H = 22;
    const pillX  = fx;
    const pillY  = fy - PILL_H - 6;
    const pillW  = textW + PAD * 2;

    if (pillY > 2) { // only draw if there's room above the frame
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
      roundRectPath(ctx, pillX, pillY, pillW, PILL_H, 4);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle    = "rgba(255, 255, 255, 0.90)";
      ctx.font         = FONT;
      ctx.textBaseline = "middle";
      ctx.fillText(label, pillX + PAD, pillY + PILL_H / 2);
    }
  }, [containerSize, preset, showGrid]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    // pointer-events: none so OrbitControls on the Three.js canvas still works
    <div ref={wrapRef} className="absolute inset-0 pointer-events-none">
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Grid toggle button — needs pointer events, sits in the corner */}
      <button
        onClick={() => setShowGrid(!showGrid)}
        className={cn(
          "pointer-events-auto absolute bottom-16 right-4",
          "flex h-8 w-8 items-center justify-center rounded-lg border transition-all",
          showGrid
            ? "border-brand-500 bg-brand-900/80 text-brand-300"
            : "border-white/20 bg-black/40 text-white/50 hover:border-white/40 hover:text-white/80",
        )}
        title="Toggle rule-of-thirds grid"
        aria-label="Toggle rule-of-thirds grid"
      >
        <Grid3X3 className="h-4 w-4" />
      </button>
    </div>
  );
}
