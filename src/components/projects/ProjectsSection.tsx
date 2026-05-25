"use client";

// [Session 4] Client component for the projects section of the dashboard.
// Fetches project list on mount and handles the empty state + new project CTA.

import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { ProjectCard } from "./ProjectCard";
import { NewProjectButton } from "./NewProjectButton";
import type { ProjectSummary } from "@/lib/projects/types";

export function ProjectsSection({ passPurchased }: { passPurchased: boolean }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = () => {
    fetch("/api/projects/list")
      .then((r) => r.json())
      .then((data: ProjectSummary[]) => {
        setProjects(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleDelete = async (projectId: string) => {
    await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    setProjects((prev) => prev.filter((p) => p.projectId !== projectId));
  };

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Projects</h2>
          {!loading && (
            <p className="text-xs text-brand-300/50">
              {projects.length} {projects.length === 1 ? "project" : "projects"}
            </p>
          )}
        </div>
        <NewProjectButton />
      </div>

      {/* Pass purchased banner */}
      {passPurchased && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 text-sm text-amber-300">
          🎟️ Project Pass purchased — 1 credit added. Create a new project to use it.
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-black/30 h-56 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && projects.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-10 text-center space-y-4">
          <FolderOpen className="mx-auto h-10 w-10 text-brand-600" />
          <div>
            <p className="text-sm font-semibold text-white">No projects yet</p>
            <p className="text-xs text-brand-300/50 mt-1">
              Create your first project to start designing your book cover.
            </p>
          </div>
          <NewProjectButton />
        </div>
      )}

      {/* Project grid */}
      {!loading && projects.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.projectId}
              project={project}
              onDelete={() => handleDelete(project.projectId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
