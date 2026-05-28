"use client";

// [v2.1 Part 2] Removed onResetCamera prop and bottom camera controls bar —
// Reset View and Auto-rotate are now in SafeZoneOverlay (canvas toolbar).

import {
  Image as ImageIcon,
  Palette,
  Sun,
  Sliders,
  Type,
  Download,
} from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { CoverDropzone } from "./CoverDropzone";
import { BackgroundSelector } from "./BackgroundSelector";
import { LightingControls } from "./LightingControls";
import { PhotoAdjustments } from "./PhotoAdjustments";
import { TextOverlayPanel } from "./TextOverlayPanel";
import { cn } from "@/lib/utils";
import type { ExportMode } from "@/types";

interface SidePanelProps {
  onExport: (w: number, h: number, mode: ExportMode) => Promise<Blob | null>;
  getWatermarkPosition?: (w: number, h: number) => { x: number; y: number } | null;
}

const TABS = [
  { id: "cover",      label: "Cover",  Icon: ImageIcon },
  { id: "background", label: "Scene",  Icon: Palette   },
  { id: "lighting",   label: "Light",  Icon: Sun       },
  { id: "adjust",     label: "Adjust", Icon: Sliders   },
  { id: "text",       label: "Text",   Icon: Type      },
  { id: "export",     label: "Export", Icon: Download  },
] as const;

// Lazy import ExportPanel only in the export tab to keep bundle trim
import dynamic from "next/dynamic";
const ExportPanel = dynamic(() =>
  import("./ExportPanel").then((m) => ({ default: m.ExportPanel })),
  { ssr: false },
);

export function SidePanel({ onExport, getWatermarkPosition }: SidePanelProps) {
  const activePanel = useEditorStore((s) => s.activePanel);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);

  return (
    <aside className="flex h-full w-80 flex-col border-l border-surface-3 bg-surface/80 backdrop-blur-md">
      {/* Tab bar */}
      <div className="flex items-center border-b border-surface-3 overflow-x-auto scrollbar-none">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActivePanel(id as typeof activePanel)}
            className={cn(
              "flex flex-col items-center gap-0.5 px-3 py-3 text-[10px] font-semibold uppercase tracking-widest transition-all flex-shrink-0 border-b-2",
              activePanel === id
                ? "border-brand-500 text-brand-300"
                : "border-transparent text-brand-300/40 hover:text-brand-300/70",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
        {activePanel === "cover"      && <CoverDropzone />}
        {activePanel === "background" && <BackgroundSelector />}
        {activePanel === "lighting"   && <LightingControls />}
        {activePanel === "adjust"     && <PhotoAdjustments />}
        {activePanel === "text"       && <TextOverlayPanel />}
        {activePanel === "export"     && <ExportPanel onExport={onExport} getWatermarkPosition={getWatermarkPosition} />}
      </div>

    </aside>
  );
}
