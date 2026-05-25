"use client";

import Link from "next/link";
import { BookOpen, Trash2 } from "lucide-react";
import type { ProjectSummary } from "@/lib/projects/types";

interface ProjectCardProps {
  project: ProjectSummary;
  onDelete?: () => void;
}

function TierBadge({ tier }: { tier: string }) {
  if (tier === "pro") {
    return (
      <span className="inline-flex items-center rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
        Pro
      </span>
    );
  }
  if (tier === "project_pass") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
        Pass
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-300/60">
      Free
    </span>
  );
}

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const { projectId, name, coverSignedUrl, updatedAt, bookSize, tier } = project;

  const updatedLabel = new Date(updatedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 overflow-hidden flex flex-col">
      {/* Thumbnail */}
      {coverSignedUrl ? (
        <img
          src={coverSignedUrl}
          alt={`${name} cover`}
          className="w-full h-40 object-cover rounded-t-xl"
        />
      ) : (
        <div className="w-full h-40 rounded-t-xl bg-surface-2 flex items-center justify-center">
          <BookOpen className="h-10 w-10 text-brand-300/20" />
        </div>
      )}

      {/* Info */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-white leading-snug line-clamp-2">{name}</p>
          <TierBadge tier={tier} />
        </div>

        <p className="text-xs text-brand-300/50 capitalize">{bookSize}</p>

        <p className="text-xs text-brand-300/40">Updated {updatedLabel}</p>

        {/* Actions */}
        <div className="mt-auto flex items-center gap-2 pt-3">
          <Link
            href={`/builder/${projectId}`}
            className="flex-1 rounded-xl bg-brand-600 hover:bg-brand-500 py-2 text-center text-sm font-semibold text-white transition-colors"
          >
            Open
          </Link>
          {onDelete && (
            <button
              onClick={onDelete}
              className="flex items-center justify-center rounded-xl border border-white/10 bg-black/20 p-2 text-red-400 hover:text-red-300 hover:border-red-400/30 transition-colors"
              aria-label="Delete project"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
