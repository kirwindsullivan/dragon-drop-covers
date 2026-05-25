"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { ProjectPassModal } from "./ProjectPassModal";

export function NewProjectButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Untitled Project" }),
      });

      const data = await res.json() as { projectId?: string; code?: string; error?: string };

      if (res.ok && data.projectId) {
        router.push(`/builder/${data.projectId}`);
        return; // keep loading=true while navigating
      }

      if (res.status === 403 && data.code === "no_access") {
        setShowModal(true);
      }
    } catch {
      // Network error — silently reset so user can retry
    }

    setLoading(false);
  };

  return (
    <>
      <button
        onClick={handleCreate}
        disabled={loading}
        className="flex items-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        {loading ? "Creating…" : "+ New Project"}
      </button>

      {showModal && (
        <ProjectPassModal onClose={() => setShowModal(false)} />
      )}
    </>
  );
}
