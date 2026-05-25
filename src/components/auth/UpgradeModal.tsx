"use client";

// Thin wrapper used by ExportPanel when a user clicks a locked preset.
// Delegates all rendering to UpgradeOptionsModal — no Stripe logic here.

import { UpgradeOptionsModal } from "@/components/billing/UpgradeOptionsModal";

interface UpgradeModalProps {
  presetName: string;
  onClose: () => void;
}

export function UpgradeModal({ presetName, onClose }: UpgradeModalProps) {
  return (
    <UpgradeOptionsModal
      onClose={onClose}
      heading={`Unlock "${presetName}"`}
      subheading="This export preset requires a Project Pass or a Pro subscription."
    />
  );
}
