"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Wordmark } from "@/components/logo";
import { Notice } from "@/components/notice";
import { useFeedback, useSession } from "@/components/providers";
import { api, csrfToken } from "@/lib/api";

/** Only same-site relative paths are accepted as post-login destinations. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/account";
  return raw;
}

const ERRORS: Record<string, { title: string; body: string }> = {
  cancelled: { title: "Sign-in was cancelled", body: "No problem — you can try again, or keep shopping as a guest." },
  provider: { title: "Google sign-in didn't complete", body: "Something went wrong talking to Google. Please try again in a moment." },
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.5 5.5 0 0 1-2.39 3.62v3h3.86c2.26-2.09 3.58-5.17 3.58-8.81z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.92l-3.86-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.27A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.27v-3.1H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.37l3.98-3.1z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.43-3.43C17.94 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.63l3.98 3.1C6.22 6.88 8.87 4.77 12 4.77z" />
    </svg>
  );
}

function SignIn() {
  const params = useSearchParams();
  const router = useRouter();
  const next = safeNext(params.get("next"));
  const error = ERRORS[params.get("error") ?? ""];
  const { session, loading, refresh } = useSession();
  const { toast } = useFeedback();
  const [csrf, setCsrf] = useState("");
  const [redirecting, setRedirecting] = useState(false);
  const [devPending, setDevPending] = useState(false);

  useEffect(() => {
    document.title = "Sign in · Conzoomer";
  }, []);
  useEffect(() => {
    if (!loading) setCsrf(csrfToken());
  }, [loading]);
  useEffect(() => {
    if (session?.user) router.replace(next);
  }, [session?.user, next, router]);

  const devLogin = async () => {
    setDevPending(true);
    try {
      await api("/api/auth/dev-login/", { method: "POST" });
      await refresh();
      toast({ tone: "success", title: "Signed in as the local demo shopper." });
    } catch {
      toast({ tone: "error", title: "Developer sign-in isn't available." });
      setDevPending(false);
    }
  };

  return (
    <div className="container-page flex justify-center py-14 lg:py-20">
      <div className="w-full max-w-md">
        <div className="card p-8 sm:p-10">
          <Wordmark className="text-3xl" />
          <h1 className="mt-6 text-3xl font-medium">Sign in</h1>
          <p className="mt-2 text-ink-soft">Keep your cart across devices and see your order history. Your current cart comes with you.</p>

          {error && (
            <Notice tone="warn" role="alert" title={error.title} className="mt-6">{error.body}</Notice>
          )}

          <div className="mt-8">
            {loading ? (
              <div className="skeleton h-12 w-full rounded-full" />
            ) : session?.google_enabled ? (
              // allauth requires a POST (with CSRF) to start the OAuth flow.
              <form method="post" action="/accounts/google/login/" onSubmit={() => setRedirecting(true)}>
                <input type="hidden" name="csrfmiddlewaretoken" value={csrf} />
                <input type="hidden" name="process" value="login" />
                <input type="hidden" name="next" value={next} />
                <button type="submit" className="btn btn-outline btn-lg w-full !border-ink bg-paper" disabled={redirecting || !csrf}>
                  {redirecting ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <GoogleIcon />}
                  {redirecting ? "Redirecting to Google…" : "Continue with Google"}
                </button>
              </form>
            ) : (
              <Notice tone="info" title="Google sign-in isn't set up yet">
                Add <code className="font-mono">GOOGLE_OAUTH_CLIENT_ID</code> and <code className="font-mono">GOOGLE_OAUTH_CLIENT_SECRET</code> to the backend
                <code className="font-mono"> .env</code> and restart Django. See the README for the Google Cloud steps.
              </Notice>
            )}

            {session?.dev_login_enabled && (
              <div className="mt-6 border-t border-dashed border-line-strong pt-6">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-warn">Local development only</p>
                <button type="button" onClick={devLogin} disabled={devPending} className="btn btn-ghost mt-2 w-full border border-dashed border-line-strong">
                  {devPending ? "Signing in…" : "Developer sign-in (demo shopper)"}
                </button>
                <p className="mt-2 text-xs text-ink-muted">Enabled by DEV_LOGIN_ENABLED with DEBUG on. Never available in production.</p>
              </div>
            )}
          </div>

          <p className="mt-8 text-sm text-ink-muted">
            No account needed to buy — <Link href={next === "/checkout" ? "/checkout" : "/shop"} className="link font-medium">continue as a guest</Link>.
          </p>
        </div>
        <p className="mt-4 text-center text-xs text-ink-muted">We only use your Google name, email and profile photo to create your Conzoomer account.</p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignIn />
    </Suspense>
  );
}
