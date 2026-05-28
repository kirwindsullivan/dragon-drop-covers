export interface ProjectMeta {
  projectId: string;
  clerkUserId: string;
  name: string;
  createdAt: string;       // ISO
  updatedAt: string;       // ISO
  coverKey: string | null;
  coverSignedUrl: string | null;
  signedUrlExpiry: string | null;  // ISO
  bookSize: "hardcover" | "softcover" | "digest" | "zine" | "letter";
  settings: {
    background:            Record<string, unknown>;
    lighting:              Record<string, unknown>;
    adjustments:           Record<string, unknown>;
    finish:                "matte" | "satin" | "gloss";
    overlayTitle:          string;
    overlayTagline:        string;
    // [v2.1] Scene upgrades
    hdriIntensity?:        number;
    atmosphericEffect?:    string;
    atmosphericIntensity?: number;
    activeCameraPreset?:   string | null;
  };
  exportCount: number;
  tier: "free" | "project_pass" | "pro";
}

export interface ProjectSummary {
  projectId: string;
  name: string;
  coverSignedUrl: string | null;
  updatedAt: string;
  bookSize: string;
  tier: string;
}
