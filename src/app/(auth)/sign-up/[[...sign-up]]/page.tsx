import { SignUp } from "@clerk/nextjs";

const clerkAppearance = {
  variables: {
    colorPrimary: "#a855f7",
    colorBackground: "#0f0a1a",
    colorText: "#e9d5ff",
    colorTextSecondary: "#c4b5fd80",
    colorInputBackground: "#15102a",
    colorInputText: "#f3e8ff",
    colorNeutral: "#7c3aed",
    borderRadius: "0.75rem",
  },
  elements: {
    card: "shadow-2xl border border-white/10 bg-[#0f0a1a]",
    headerTitle: "text-white",
    headerSubtitle: "text-purple-300/70",
    socialButtonsBlockButton:
      "border-white/10 bg-white/5 text-white hover:bg-white/10 transition-colors",
    socialButtonsBlockButtonText: "text-white font-medium",
    dividerLine: "bg-white/10",
    dividerText: "text-purple-300/50",
    formButtonPrimary:
      "bg-purple-600 hover:bg-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.3)] transition-all",
    formFieldInput:
      "border-white/10 bg-[#15102a] text-white placeholder:text-purple-300/30 focus:border-purple-500",
    formFieldLabel: "text-purple-200/80",
    footerActionLink: "text-purple-400 hover:text-purple-300",
  },
} as const;

export default function SignUpPage() {
  return (
    <SignUp
      appearance={clerkAppearance}
      signInUrl="/sign-in"
      fallbackRedirectUrl="/editor"
    />
  );
}
