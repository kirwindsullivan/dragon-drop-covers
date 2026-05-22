"use client";

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

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label-xs">Title Color</label>
          <input
            type="color"
            value={text.titleColor}
            onChange={(e) => setTextOverlay({ titleColor: e.target.value })}
            className="h-9 w-full cursor-pointer rounded-lg border border-surface-3 bg-transparent p-1"
          />
        </div>
        <div>
          <label className="label-xs">Tagline Color</label>
          <input
            type="color"
            value={text.taglineColor}
            onChange={(e) => setTextOverlay({ taglineColor: e.target.value })}
            className="h-9 w-full cursor-pointer rounded-lg border border-surface-3 bg-transparent p-1"
          />
        </div>
      </div>

      <div>
        <label className="label-xs">Position</label>
        <div className="flex gap-2 mt-1">
          {(["top", "center", "bottom"] as const).map((pos) => (
            <button
              key={pos}
              onClick={() => setTextOverlay({ position: pos })}
              className={`flex-1 rounded-lg border py-1.5 text-xs capitalize transition-all ${
                text.position === pos
                  ? "border-brand-500 bg-brand-900/60 text-brand-200"
                  : "border-surface-3 text-brand-300/60 hover:border-brand-600"
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-brand-300/40">
        Text renders on top of the final export composite. Logo upload coming soon.
      </p>
    </div>
  );
}
