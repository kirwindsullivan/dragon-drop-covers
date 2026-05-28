"use client";

import { useCallback, useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { ImageIcon, UploadCloud, X, AlertCircle } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { useEditorStore } from "@/store/editorStore";
import { cn } from "@/lib/utils";

// ── localStorage key helpers ──────────────────────────────────────────────────
// Keys are user-scoped so different users on the same device never share entries.
// The legacy key "ddcovers.r2key" is cleaned up on first load.
const LEGACY_LS_KEY = "ddcovers.r2key";
const getCoverLsKey  = (userId: string) => `dragon-drop:${userId}:cover-r2key`;

// ── R2 upload with XHR progress ───────────────────────────────────────────────

function uploadToR2(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`R2 upload failed: HTTP ${xhr.status}`));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CoverDropzone() {
  const coverUrl      = useEditorStore((s) => s.coverImageUrl);
  const coverR2Key    = useEditorStore((s) => s.coverR2Key);
  const setCoverImage = useEditorStore((s) => s.setCoverImage);
  const setCoverR2Key = useEditorStore((s) => s.setCoverR2Key);
  const bookSize      = useEditorStore((s) => s.bookSize);
  const setSpineTitle = useEditorStore((s) => s.setSpineTitle);
  const spineTitle    = useEditorStore((s) => s.spineTitle);
  // [Session 4] When projectId is set we route uploads through the project cover API
  const projectId     = useEditorStore((s) => s.projectId);

  // Current authenticated user — used to scope localStorage keys
  const { user } = useUser();
  const userId  = user?.id ?? null;
  // User-scoped key, or null while auth is still loading
  const lsKey   = userId ? getCoverLsKey(userId) : null;

  const [isDragOver, setIsDragOver]   = useState(false);
  const [uploadPct, setUploadPct]     = useState<number | null>(null); // null = idle
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ── Restore cover from previous session (standalone editor only) ─────────────
  useEffect(() => {
    // Always purge the legacy unscoped key — one-time migration cleanup.
    localStorage.removeItem(LEGACY_LS_KEY);

    // In project context the builder page owns cover restoration — skip localStorage.
    if (projectId) return;
    // Wait until Clerk has resolved the current user before reading localStorage.
    if (!userId || !lsKey) return;
    // Only restore if no cover is loaded yet.
    if (coverUrl) return;

    const savedKey = localStorage.getItem(lsKey);
    if (!savedKey) return;

    // Ownership check: the R2 key path is structured as
    // users/{clerkUserId}/...  — validate it belongs to the current user before
    // making any API call.  Discards stale keys left by previous users on this
    // device without needing a round-trip.
    if (!savedKey.includes(`users/${userId}/`)) {
      localStorage.removeItem(lsKey);
      return;
    }

    fetch(`/api/upload/signed-url?key=${encodeURIComponent(savedKey)}`)
      .then((r) => r.json())
      .then(async ({ readUrl }: { readUrl?: string }) => {
        if (!readUrl) {
          localStorage.removeItem(lsKey);
          return;
        }
        // Pre-fetch as blob so Three.js gets a same-origin URL (avoids cross-origin
        // WebGL texture restriction that makes the model render blank).
        try {
          const resp = await fetch(readUrl);
          if (resp.ok) {
            const blob = await resp.blob();
            setCoverImage(URL.createObjectURL(blob), null, savedKey);
          } else {
            localStorage.removeItem(lsKey);
          }
        } catch {
          localStorage.removeItem(lsKey);
        }
      })
      .catch(() => localStorage.removeItem(lsKey));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]); // re-run if the authenticated user changes

  // ── Drop handler ──────────────────────────────────────────────────────────────
  const onDrop = useCallback(
    async (accepted: File[]) => {
      const file = accepted[0];
      if (!file) return;

      setIsDragOver(false);
      setUploadError(null);

      // Immediate local preview so Three.js loads without waiting for R2
      const localUrl = URL.createObjectURL(file);
      setCoverImage(localUrl, file, null);

      // Start upload
      setUploadPct(0);
      try {
        // Step 1: get presigned URLs — use project cover route when in builder context
        // [Session 4] Routes through /api/projects/[id]/cover which enforces 1-cover-per-project
        const coverApiUrl = projectId
          ? `/api/projects/${projectId}/cover`
          : "/api/upload/cover";
        const res = await fetch(coverApiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentType: file.type,
            filename: file.name,
          }),
        });
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const { uploadUrl, readUrl, key } = await res.json() as {
          uploadUrl: string;
          readUrl: string;
          key: string;
        };

        // Step 2: upload directly to R2
        await uploadToR2(uploadUrl, file, setUploadPct);

        // Step 3: store R2 key — keep blob URL active for the 3D viewer this session.
        // (On next session load we restore from the signed R2 URL; no cross-origin
        //  texture reload needed mid-session.)
        setCoverR2Key(key);
        // Write to user-scoped key only; never write to the legacy unscoped key.
        if (lsKey) localStorage.setItem(lsKey, key);
      } catch (err) {
        console.error("Cover upload failed:", err);
        setUploadError("Upload failed — cover loaded locally only.");
        // Keep the local blob URL so the 3D viewer still works this session
      } finally {
        setUploadPct(null);
      }
    },
    [setCoverImage, lsKey],
  );

  // ── Remove handler ────────────────────────────────────────────────────────────
  const handleRemove = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const key = coverR2Key;
      setCoverImage(null, null, null);
      if (lsKey) localStorage.removeItem(lsKey);
      localStorage.removeItem(LEGACY_LS_KEY); // belt-and-suspenders for legacy key

      if (key) {
        if (projectId) {
          // [Session 4] In project context: PATCH clears the cover from meta.json + R2
          fetch(`/api/projects/${projectId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clearCover: true }),
          }).catch(console.error);
        } else {
          // Standalone editor: fire-and-forget delete from R2
          fetch("/api/upload/cover", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key }),
          }).catch(console.error);
        }
      }
    },
    [coverR2Key, setCoverImage, lsKey],
  );

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".tiff"] },
    maxFiles: 1,
    onDragEnter: () => setIsDragOver(true),
    onDragLeave: () => setIsDragOver(false),
    disabled: uploadPct !== null,
  });

  const uploading = uploadPct !== null;

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={cn(
          "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed cursor-pointer transition-all",
          "min-h-[140px] p-4 text-center",
          uploading
            ? "border-brand-500 bg-brand-900/20 cursor-wait"
            : isDragOver
            ? "border-brand-400 bg-brand-900/40"
            : coverUrl
            ? "border-brand-600/50 bg-surface-2"
            : "border-surface-3 hover:border-brand-600 bg-surface-1 hover:bg-surface-2",
        )}
      >
        <input {...getInputProps()} />

        {uploading ? (
          // ── Upload progress ──────────────────────────────────────────────
          <div className="flex flex-col items-center gap-3 w-full">
            <UploadCloud className="h-8 w-8 text-brand-400 animate-pulse" />
            <p className="text-xs font-medium text-brand-200">Uploading…</p>
            <div className="w-full max-w-[160px] h-1.5 rounded-full bg-surface-3 overflow-hidden">
              <div
                className="h-full bg-brand-500 rounded-full transition-all duration-100"
                style={{ width: `${uploadPct}%` }}
              />
            </div>
            <p className="text-[10px] text-brand-300/50">{uploadPct}%</p>
          </div>
        ) : coverUrl ? (
          // ── Preview ──────────────────────────────────────────────────────
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverUrl}
              alt="Cover preview"
              className="max-h-32 rounded shadow-lg object-contain"
            />
            <p className="mt-2 text-xs text-brand-300">
              {coverR2Key ? "Saved to cloud · Drop to replace" : "Local only · Drop to replace"}
            </p>
          </>
        ) : (
          // ── Empty state ──────────────────────────────────────────────────
          <>
            <UploadCloud
              className={cn(
                "mb-3 h-10 w-10 transition-colors",
                isDragOver ? "text-brand-400" : "text-brand-600",
              )}
            />
            <p className="text-sm font-medium text-white">Drop your front cover here</p>
            <p className="mt-1 text-xs text-brand-300/70">PNG, JPG, WebP — any size</p>
          </>
        )}
      </div>

      {/* Upload error */}
      {uploadError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-800/40 bg-red-950/30 p-3 text-xs text-red-300">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {uploadError}
        </div>
      )}

      {/* Clear button */}
      {coverUrl && !uploading && (
        <button
          onClick={handleRemove}
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
              ["hardcover",  "Hardcover"],
              ["softcover",  "Softcover"],
              ["digest",     "Digest"],
              ["zine",       "Zine"],
              ["letter",     "Letter / Large"],
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
            (rendered on spine)
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

      {/* Info */}
      <div className="rounded-lg border border-brand-800/40 bg-brand-950/30 p-3 text-xs text-brand-300/60">
        <ImageIcon className="mb-1 inline-block h-3.5 w-3.5 mr-1" />
        Spine &amp; back cover are generated from your front cover&apos;s dominant colors.
        {coverR2Key
          ? " Cover saved to cloud and will reload on next visit."
          : " Upload to cloud to persist across sessions."}
      </div>
    </div>
  );
}
