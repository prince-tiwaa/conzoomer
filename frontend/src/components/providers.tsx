"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

import { api } from "@/lib/api";
import type { SessionInfo } from "@/lib/types";

/* ---------------- Session (user + cart count) ---------------- */

interface SessionContextValue {
  session: SessionInfo | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setCartCount: (n: number) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <Providers>");
  return ctx;
}

/* ---------------- Toasts + screen-reader announcements ---------------- */

type Toast = { id: number; tone: "success" | "error"; title: string; action?: { href: string; label: string } };

interface FeedbackContextValue {
  toast: (t: Omit<Toast, "id">) => void;
  announce: (message: string) => void;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used inside <Providers>");
  return ctx;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const nextId = useRef(1);

  const refresh = useCallback(async () => {
    try {
      setSession(await api<SessionInfo>("/api/session/"));
    } catch {
      // Header degrades gracefully: no count, sign-in link still works.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Keep the header's cart count current when returning to the tab (the
    // cart may have changed in the Conzoomer app).
    let last = Date.now();
    const onFocus = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 2000) return;
      last = Date.now();
      refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  const setCartCount = useCallback((n: number) => {
    setSession((s) => (s ? { ...s, cart_count: n } : s));
  }, []);

  const announce = useCallback((message: string) => {
    // Clear first so repeating the same message is still announced.
    setAnnouncement("");
    window.setTimeout(() => setAnnouncement(message), 50);
  }, []);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
      announce(t.title);
      window.setTimeout(() => dismiss(id), 5000);
    },
    [announce, dismiss],
  );

  const sessionValue = useMemo(() => ({ session, loading, refresh, setCartCount }), [session, loading, refresh, setCartCount]);
  const feedbackValue = useMemo(() => ({ toast, announce }), [toast, announce]);

  return (
    <SessionContext.Provider value={sessionValue}>
      <FeedbackContext.Provider value={feedbackValue}>
        {children}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {announcement}
        </div>
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="animate-rise pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-line bg-paper p-4 shadow-[var(--shadow-lift)]"
            >
              {t.tone === "success" ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
              ) : (
                <AlertCircle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{t.title}</p>
                {t.action && (
                  <Link href={t.action.href} className="link mt-1 inline-block text-sm font-semibold" onClick={() => dismiss(t.id)}>
                    {t.action.label}
                  </Link>
                )}
              </div>
              <button type="button" onClick={() => dismiss(t.id)} className="-m-1 rounded-full p-1 text-ink-muted hover:bg-sand hover:text-ink" aria-label="Dismiss notification">
                <X className="size-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      </FeedbackContext.Provider>
    </SessionContext.Provider>
  );
}
