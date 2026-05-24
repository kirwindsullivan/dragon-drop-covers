import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dragon Drop Covers — 3D Book Mockups for TTRPG Creators",
  description:
    "Generate high-fidelity 3D book cover marketing images without a 3D artist. Drop your cover, pick a mood, export for Kickstarter.",
  openGraph: {
    title: "Dragon Drop Covers",
    description: "3D book mockup generator for TTRPG creators",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/editor"
      signUpFallbackRedirectUrl="/editor"
    >
      <html lang="en">
        <body className="antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
