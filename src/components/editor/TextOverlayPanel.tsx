"use client";

// [Sessions 1–5] Text overlay panel.
// [v2.1 Part 8] Simplified — removed color pickers, position buttons, font/size
//               controls.  Title and tagline inputs remain; live preview is handled
//               by TextOverlayCanvas (Part 7).  Export compositing logic in
//               ExportPanel is UNCHANGED — stored style fields still exist in state.

import { useEditorStore } from "@/store/editorStore";

export function TextOverlayPanel() {
  const text = useEditorStore((s) => s.textOverlay);
  const setTextOverlay = useEditorStore((s) => s.setTextOverlay);

  return (
    <div className="space-y-4">
      <label className="block text-xs font-semibold uppercase tracking-widest text-brand-300/70">
        Text Overlay
      </label>

      <div>
        <label className="label-xs">Title</label>
        <input
          type="text"
          value={text.title}
          onChange={(e) => setTextOverlay({ title: e.target.value })}
          placeholder="Book Title"
          className="input-field"
        />
      </div>

      <div>
        <label className="label-xs">Tagline</label>
        <input
          type="text"
          value={text.tagline}
          onChange={(e) => setTextOverlay({ tagline: e.target.value })}
          placeholder="An epic adventure awaits"
          className="input-field"
        />
      </div>

      <p className="text-[11px] text-brand-300/40 italic">
        For final typography, export and use your design tool
      </p>

      <p className="text-xs text-brand-300/40">
        Preview renders live on the canvas. Text composites on Quick Post export.
      </p>
    </div>
  );
}
