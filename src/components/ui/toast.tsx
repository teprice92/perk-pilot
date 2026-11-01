"use client";

import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { create } from "zustand";

type Toast = { id: number; title: string; body?: string; tone: "success" | "info" | "warning" };
const useToasts = create<{ toasts: Toast[]; push: (t: Omit<Toast, "id">) => void; dismiss: (id: number) => void }>((set) => ({
  toasts: [],
  push: (t) => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 4200);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = (title: string, body?: string, tone: Toast["tone"] = "success") => useToasts.getState().push({ title, body, tone });

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            onClick={() => dismiss(t.id)}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-border bg-elevated p-4 text-left shadow-float"
          >
            {t.tone === "success" ? <CheckCircle2 className="mt-0.5 size-5 text-success" /> : t.tone === "warning" ? <TriangleAlert className="mt-0.5 size-5 text-warning" /> : <Info className="mt-0.5 size-5 text-accent" />}
            <span>
              <span className="block text-sm font-medium">{t.title}</span>
              {t.body && <span className="mt-0.5 block text-xs text-fg-muted">{t.body}</span>}
            </span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
