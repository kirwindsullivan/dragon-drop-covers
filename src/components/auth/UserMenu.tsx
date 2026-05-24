"use client";

import { useState } from "react";
import { useUser, useClerk } from "@clerk/nextjs";
import { LogOut, LayoutDashboard, ChevronDown } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { getTierFromUser } from "@/lib/tier";
import { cn } from "@/lib/utils";

export function UserMenu() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);

  if (!isLoaded || !user) return null;

  const tier = getTierFromUser(user);
  const initials =
    [user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join("") ||
    user.emailAddresses[0]?.emailAddress[0]?.toUpperCase() ||
    "?";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-black/30 pl-1.5 pr-2.5 py-1 backdrop-blur-sm hover:bg-black/50 transition-colors"
      >
        {/* Avatar */}
        {user.imageUrl ? (
          <Image
            src={user.imageUrl}
            alt={user.fullName ?? ""}
            width={24}
            height={24}
            className="h-6 w-6 rounded-full object-cover"
          />
        ) : (
          <div className="h-6 w-6 rounded-full bg-brand-700 flex items-center justify-center text-[11px] font-bold text-white">
            {initials}
          </div>
        )}

        {/* Tier badge */}
        <span
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded font-semibold",
            tier === "pro"
              ? "bg-brand-500 text-white"
              : "bg-surface-3 text-brand-300",
          )}
        >
          {tier === "pro" ? "Pro" : "Free"}
        </span>

        <ChevronDown
          className={cn(
            "h-3 w-3 text-brand-300/50 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-2 z-50 w-56 rounded-xl border border-white/10 bg-surface-1 shadow-2xl overflow-hidden">
            {/* Identity */}
            <div className="px-3 py-2.5 border-b border-white/10">
              <p className="text-sm font-medium text-white truncate">
                {user.fullName || user.emailAddresses[0]?.emailAddress}
              </p>
              <p className="text-xs text-brand-300/50 truncate">
                {user.emailAddresses[0]?.emailAddress}
              </p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-brand-400">
                {tier === "pro" ? "⚡ Pro plan" : "Free plan"}
              </p>
            </div>

            {/* Actions */}
            <div className="p-1">
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-brand-200 hover:bg-surface-2 transition-colors"
              >
                <LayoutDashboard className="h-4 w-4 text-brand-400" />
                Dashboard
              </Link>
              <button
                onClick={() => signOut({ redirectUrl: "/" })}
                className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-brand-200 hover:bg-surface-2 transition-colors"
              >
                <LogOut className="h-4 w-4 text-brand-400" />
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
