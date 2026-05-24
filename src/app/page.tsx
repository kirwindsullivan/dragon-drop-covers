import Link from "next/link";
import { ArrowRight, BookOpen, Layers, Zap } from "lucide-react";

const FEATURES = [
  { icon: BookOpen, label: "PBR Lighting" },
  { icon: Layers,   label: "Orbit Camera" },
  { icon: Zap,      label: "One-Click Export" },
] as const;

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background atmosphere */}
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at 60% 40%, #1a0040 0%, #0d001a 50%, #000000 100%)",
        }}
      />
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 80%, #3d1200 0%, transparent 50%)",
        }}
      />

      {/* Hero */}
      <div className="max-w-3xl text-center space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-700/50 bg-brand-950/50 px-4 py-1.5 text-xs text-brand-300 backdrop-blur-sm">
          <Zap className="h-3.5 w-3.5 text-brand-400" />
          Built for TTRPG creators
        </div>

        <h1
          className="text-5xl md:text-7xl font-bold tracking-tight text-white"
          style={{ fontFamily: "var(--font-display)", lineHeight: 1.1 }}
        >
          Dragon Drop{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage: "linear-gradient(135deg, #a855f7, #ec4899)",
            }}
          >
            Covers
          </span>
        </h1>

        <p className="text-lg md:text-xl text-brand-200/70 max-w-xl mx-auto leading-relaxed">
          Drop your front cover. Watch it wrap around a high-fidelity 3D book
          in seconds. Export a transparent PNG ready for your Kickstarter
          campaign.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
          <Link
            href="/sign-up"
            className="group flex items-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-500 px-8 py-3.5 font-semibold text-white shadow-[0_0_30px_rgba(168,85,247,0.4)] transition-all hover:shadow-[0_0_40px_rgba(168,85,247,0.6)]"
          >
            Start for free
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link href="/sign-in" className="text-sm text-brand-300/50 hover:text-brand-300 transition-colors">
            Already have an account? Sign in
          </Link>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-3 pt-6">
          {FEATURES.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-full border border-surface-3 bg-surface-1/60 px-4 py-1.5 text-sm text-brand-200/70 backdrop-blur-sm"
            >
              <Icon className="h-3.5 w-3.5 text-brand-400" />
              {label}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
