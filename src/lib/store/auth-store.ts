"use client";

import { create } from "zustand";

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  role: "owner" | "member";
  aiEnabled: boolean;
  householdId: string | null;
}

interface AuthState {
  status: "loading" | "ready" | "error";
  authEnabled: boolean;
  user: AuthUser | null;
  needsSetup: boolean;
  signup: "invite" | "open";
  refresh: () => Promise<void>;
}

/** Who is signed in (or whether logins are even enabled on this deployment). */
export const useAuth = create<AuthState>((set) => ({
  status: "loading",
  authEnabled: false,
  user: null,
  needsSetup: false,
  signup: "invite",
  refresh: async () => {
    try {
      const res = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
      const data = await res.json();
      set({ status: res.ok ? "ready" : "error", authEnabled: Boolean(data.authEnabled), user: data.user ?? null, needsSetup: Boolean(data.needsSetup), signup: data.signup === "open" ? "open" : "invite" });
    } catch {
      // Offline: keep whatever we knew; the app still works from local data.
      set((s) => ({ ...s, status: s.status === "loading" ? "error" : s.status }));
    }
  },
}));
