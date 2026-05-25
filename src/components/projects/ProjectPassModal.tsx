"use client";

// Thin wrapper shown by NewProjectButton when the user has neither a Pro
// subscription nor any remaining Project Pass credits (API returns 403).
// Delegates all rendering to UpgradeOptionsModal — no Stripe logic here.

import { UpgradeOptionsModal } from "@/components/billing/UpgradeOptionsModal";

interface ProjectPassModalProps {
  onClose: () => void;
}

export function ProjectPassModal({ onClose }: ProjectPassModalProps) {
  return (
    <UpgradeOptionsModal
      onClose={onClose}
      heading="Start a new project"
      subheading="You need a Project Pass or a Pro subscription to create a project."
    />
  );
}
