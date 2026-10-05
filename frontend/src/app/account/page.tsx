"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ChevronRight, LogOut, Package } from "lucide-react";

import { Notice } from "@/components/notice";
import { useFeedback, useSession } from "@/components/providers";
import { RequireUser } from "@/components/require-user";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatMoney, pluralize } from "@/lib/format";
import type { OrderSummary } from "@/lib/types";

type Page = { count: number; page: number; num_pages: number; results: OrderSummary[] };

const STATUS_TONE: Record<string, string> = {
  placed: "bg-cobalt-wash text-cobalt-deep",
  processing: "bg-warn-wash text-warn",
  shipped: "bg-success-wash text-success",
  delivered: "bg-success-wash text-success",
  cancelled: "bg-sand text-ink-muted",
};

function Orders() {
  const params = useSearchParams();
  const page = Math.max(1, Number(params.get("page") || 1));
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    api<Page>(`/api/account/orders/?page=${page}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load your orders."));
  }, [page]);

  if (error) return <Notice tone="error" role="alert" title="We couldn't load your orders">{error}</Notice>;
  if (!data) return <div className="space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-20 w-full" />)}</div>;
  if (data.count === 0) {
    return (
      <div className="card p-10 text-center">
        <Package className="mx-auto size-8 text-ink-muted" aria-hidden />
        <h3 className="mt-4 text-2xl font-medium">No orders yet</h3>
        <p className="mt-2 text-ink-soft">Orders you place while signed in will appear here.</p>
        <Link href="/shop" className="btn btn-primary mt-6">Start shopping</Link>
      </div>
    );
  }
  return (
    <>
      <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-paper">
        {data.results.map((o) => (
          <li key={o.reference}>
            <Link href={`/account/orders/${o.reference}`} className="flex items-center gap-4 p-5 transition-colors hover:bg-ivory">
              <div className="min-w-0 flex-1">
                <p className="font-mono font-semibold">{o.reference}</p>
                <p className="mt-1 text-sm text-ink-muted">{formatDate(o.placed_at)} · {pluralize(o.item_count, "item")}</p>
              </div>
              <span className={`hidden rounded-full px-2.5 py-1 text-xs font-semibold sm:inline ${STATUS_TONE[o.status] ?? "bg-sand"}`}>{o.status_label}</span>
              <span className="font-semibold tabular-nums">{formatMoney(o.total, o.currency)}</span>
              <ChevronRight className="size-5 text-ink-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {data.num_pages > 1 && (
        <nav aria-label="Order pages" className="mt-6 flex items-center justify-between">
          {data.page > 1 ? <Link className="btn btn-outline" href={`/account?page=${data.page - 1}`}>Newer</Link> : <span />}
          <span className="text-sm text-ink-muted">Page {data.page} of {data.num_pages}</span>
          {data.page < data.num_pages ? <Link className="btn btn-outline" href={`/account?page=${data.page + 1}`}>Older</Link> : <span />}
        </nav>
      )}
    </>
  );
}

function Account() {
  const { session, refresh } = useSession();
  const { toast } = useFeedback();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const user = session!.user!;

  useEffect(() => {
    document.title = "Your account · Conzoomer";
  }, []);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await api("/api/auth/logout/", { method: "POST" });
      await refresh();
      toast({ tone: "success", title: "You've been signed out." });
      router.push("/");
    } catch {
      setSigningOut(false);
      toast({ tone: "error", title: "Couldn't sign out. Please try again." });
    }
  };

  return (
    <div className="container-page py-10 lg:py-14">
      <h1 className="text-4xl font-medium sm:text-5xl">Your account</h1>
      <div className="mt-10 grid gap-10 lg:grid-cols-12 lg:gap-12">
        <section aria-labelledby="profile-title" className="lg:col-span-4">
          <div className="card p-6">
            <h2 id="profile-title" className="sr-only">Profile</h2>
            <div className="flex items-center gap-4">
              {user.picture ? (
                <img src={user.picture} alt="" width={56} height={56} className="size-14 rounded-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="flex size-14 items-center justify-center rounded-full bg-cobalt font-display text-2xl text-white" aria-hidden>
                  {(user.first_name || user.email).charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{user.name}</p>
                <p className="truncate text-sm text-ink-muted">{user.email}</p>
              </div>
            </div>
            <dl className="mt-6 space-y-2 border-t border-line pt-5 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-ink-muted">Signed in with</dt><dd className="font-medium">{user.provider === "google" ? "Google" : user.provider === "email" ? "Email & password" : "Developer sign-in"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-muted">Member since</dt><dd className="font-medium">{formatDate(user.date_joined)}</dd></div>
            </dl>
            <button type="button" onClick={signOut} disabled={signingOut} className="btn btn-outline mt-6 w-full">
              <LogOut className="size-4" aria-hidden /> {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </section>
        <section aria-labelledby="orders-title" className="lg:col-span-8">
          <h2 id="orders-title" className="mb-5 text-2xl font-medium">Order history</h2>
          <Suspense fallback={null}>
            <Orders />
          </Suspense>
        </section>
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <RequireUser next="/account">
      <Account />
    </RequireUser>
  );
}
