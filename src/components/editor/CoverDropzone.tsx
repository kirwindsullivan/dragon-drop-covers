"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { ImageIcon, UploadCloud, X } from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { cn } from "@/lib/utils";

export function CoverDropzone() {
  const coverUrl = useEditorStore((s) => s.coverImageUrl);
  const setCoverImage = useEditorStore((s) => s.setCoverImage);
  const bookSize = useEditorStore((s) => s.bookSize);
  const setSpineTitle = useEditorStore((s) => s.setSpineTitle);
  const spineTitle = useEditorStore((s) => s.spineTitle);
  const [isDragOver, setIsDragOver] = useState(false);

  const onDrop = useCallback(
    (accepted: File[]) => {
      const file = accepted[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      setCoverImage(url, file);
      setIsDragOver(false);
    },
    [setCoverImage],
  );

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".tiff"] },
    maxFiles: 1,
    onDragEnter: () => setIsDragOver(true),
    onDragLeave: () => setIsDragOver(false),
  });

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={cn(
          "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed cursor-pointer transition-all",
          "min-h-[140px] p-4 text-center",
          isDragOver
            ? "border-brand-400 bg-brand-900/40"
            : coverUrl
            ? "border-brand-600/50 bg-surface-2"
            : "border-surface-3 hover:border-brand-600 bg-surface-1 hover:bg-surface-2",
        )}
      >
        <input {...getInputProps()} />

        {coverUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverUrl}
              alt="Cover preview"
              className="max-h-32 rounded shadow-lg object-contain"
            />
            <p className="mt-2 text-xs text-brand-300">
              Drop a new image to replace
            </p>
          </>
        ) : (
          <>
            <UploadCloud
              className={cn(
                "mb-3 h-10 w-10 transition-colors",
                isDragOver ? "text-brand-400" : "text-brand-600",
              )}
            />
            <p className="text-sm font-medium text-white">
              Drop your front cover here
            </p>
            <p className="mt-1 text-xs text-brand-300/70">
              PNG, JPG, WebP — any size
            </p>
          </>
        )}
      </div>

      {/* Clear button */}
      {coverUrl && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setCoverImage(null, null);
          }}
          className="flex items-center gap-1.5 text-xs text-brand-300 hover:text-white transition-colors"
        >
          <X className="h-3.5 w-3.5" />
          Remove cover
        </button>
      )}

      {/* Book size selector */}
      <div>
        <label className="block mb-2 text-xs font-semibold uppercase tracking-widest text-brand-300/70">
          Book Size
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["hardcover", "Hardcover"],
              ["softcover", "Softcover"],
              ["digest", "Digest"],
              ["zine", "Zine"],
              ["letter", "Letter / Large"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => useEditorStore.getState().setBookSize(id)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-xs transition-all",
                bookSize === id
                  ? "border-brand-500 bg-brand-900/60 text-brand-200"
                  : "border-surface-3 text-brand-300/70 hover:border-brand-600 hover:text-white",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Spine title */}
      <div>
        <label className="block mb-1.5 text-xs font-semibold uppercase tracking-widest text-brand-300/70">
          Spine Title
          <span className="ml-1 normal-case font-normal text-brand-300/50">
            (AI-generated on spine)
          </span>
        </label>
        <input
          type="text"
          value={spineTitle}
          onChange={(e) => setSpineTitle(e.target.value)}
          placeholder="My Book Title"
          className="w-full rounded-lg border border-surface-3 bg-surface-1 px-3 py-2 text-sm text-white placeholder:text-brand-300/40 focus:border-brand-500 focus:outline-none"
        />
      </div>

      {/* AI disclaimer */}
      <div className="rounded-lg border border-brand-800/40 bg-brand-950/30 p-3 text-xs text-brand-300/60">
        <ImageIcon className="mb-1 inline-block h-3.5 w-3.5 mr-1" />
        Spine &amp; back cover are algorithmically generated from your front cover&apos;s dominant colors.
        Customizable in future update.
      </div>
    </div>
  );
}
