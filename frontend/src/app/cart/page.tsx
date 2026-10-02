"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Loader2, ShoppingBag, Trash2 } from "lucide-react";

import { Notice } from "@/components/notice";
import { ProductImage } from "@/components/product-image";
import { useFeedback, useSession } from "@/components/providers";
import { QuantityStepper } from "@/components/quantity-stepper";
import { api, ApiError } from "@/lib/api";
import { formatMoney, pluralize } from "@/lib/format";
import type { Cart, CartNotice } from "@/lib/types";

export default function CartPage() {
  const { setCartCount } = useSession();
  const { announce } = useFeedback();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notices, setNotices] = useState<CartNotice[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [lineError, setLineError] = useState<{ id: number; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await api<Cart>("/api/cart/");
      setCart(data);
      setNotices(data.notices);
      setCartCount(data.item_count);
      if (data.notices.length) announce(data.notices.map((n) => n.message).join(" "));
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "We couldn't load your cart.");
    }
  }, [announce, setCartCount]);

  useEffect(() => {
    document.title = "Your cart · Conzoomer";
    load();
  }, [load]);

  const mutate = async (itemId: number, action: () => Promise<Cart>, message: string) => {
    setBusy(itemId);
    setLineError(null);
    try {
      const data = await action();
      setCart(data);
      setCartCount(data.item_count);
      announce(message);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "That didn't work. Please try again.";
      setLineError({ id: itemId, message: msg });
      announce(msg);
      if (e instanceof ApiError && (e.status === 404 || e.status === 409)) load();
    } finally {
      setBusy(null);
    }
  };

  if (loadError) {
    return (
      <div className="container-page py-16">
        <h1 className="text-4xl font-medium">Your cart</h1>
        <Notice tone="error" role="alert" title="We couldn't load your cart" className="mt-6 max-w-xl">
          <p>{loadError}</p>
          <button type="button" onClick={load} className="btn btn-outline mt-3 !min-h-9 text-sm">Try again</button>
        </Notice>
      </div>
    );
  }

  if (!cart) {
    return (
      <div className="container-page py-12 lg:py-16" aria-busy="true" aria-label="Loading your cart">
        <div className="skeleton h-12 w-56" />
        <div className="mt-10 grid gap-10 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-8">
            {[0, 1].map((i) => (
              <div key={i} className="flex gap-4">
                <div className="skeleton h-32 w-24 rounded-2xl" />
                <div className="flex-1 space-y-3"><div className="skeleton h-5 w-1/2" /><div className="skeleton h-4 w-1/4" /></div>
              </div>
            ))}
          </div>
          <div className="skeleton h-72 rounded-[var(--radius-card)] lg:col-span-4" />
        </div>
      </div>
    );
  }

  const currency = cart.currency;
  const threshold = Number(cart.free_shipping_threshold);
  const remaining = threshold - Number(cart.subtotal);

  if (cart.items.length === 0) {
    return (
      <div className="container-page py-16 lg:py-24">
        {notices.length > 0 && (
          <div className="mx-auto mb-8 max-w-xl space-y-2" role="status">
            {notices.map((n, i) => <Notice key={i} tone="warn">{n.message}</Notice>)}
          </div>
        )}
        <div className="mx-auto max-w-xl text-center">
          <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-sand">
            <ShoppingBag className="size-7" aria-hidden />
          </span>
          <h1 className="mt-6 text-4xl font-medium">Your cart is empty</h1>
          <p className="mt-3 text-lg text-ink-soft">Nothing here yet. Start with our featured pieces, or browse a category.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/shop" className="btn btn-primary btn-lg">Shop the collection <ArrowRight className="size-4" aria-hidden /></Link>
          </div>
          <ul className="mt-8 flex flex-wrap justify-center gap-2 text-sm">
            {["tech", "home", "lifestyle"].map((c) => (
              <li key={c}><Link href={`/shop?category=${c}`} className="inline-flex rounded-full border border-line-strong px-4 py-2 font-medium capitalize hover:border-ink">{c}</Link></li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-10 lg:py-14">
      <h1 className="text-4xl font-medium sm:text-5xl">Your cart</h1>
      <p className="mt-2 text-ink-muted">{pluralize(cart.item_count, "item")}</p>

      {notices.length > 0 && (
        <div className="mt-6 space-y-2" role="status">
          {notices.map((n, i) => (
            <Notice key={i} tone={n.type === "price_changed" && n.new_price && n.old_price && Number(n.new_price) < Number(n.old_price) ? "info" : "warn"}>
              {n.message}
              {n.type === "price_changed" && n.old_price && n.new_price && (
                <> Was {formatMoney(n.old_price, currency)}, now {formatMoney(n.new_price, currency)}.</>
              )}
            </Notice>
          ))}
        </div>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-12 lg:gap-12">
        <section aria-label="Items in your cart" className="lg:col-span-8">
          <ul className="divide-y divide-line border-y border-line">
            {cart.items.map((item) => (
              <li key={item.id} className={`flex gap-4 py-6 sm:gap-6 ${busy === item.id ? "opacity-60" : ""}`} aria-busy={busy === item.id}>
                <Link href={`/products/${item.product.slug}`} className="w-24 shrink-0 overflow-hidden rounded-2xl sm:w-28" tabIndex={-1} aria-hidden>
                  <ProductImage src={item.product.image?.url} alt="" width={240} label={item.product.category} />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">{item.product.category}</p>
                      <h2 className="mt-1 font-sans text-base font-semibold tracking-normal sm:text-lg">
                        <Link href={`/products/${item.product.slug}`} className="hover:underline">{item.product.name}</Link>
                      </h2>
                      <p className="mt-1 text-sm text-ink-muted">{formatMoney(item.unit_price, currency)} each</p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums">{formatMoney(item.line_total, currency)}</p>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
                    <QuantityStepper
                      size="sm"
                      value={item.quantity}
                      max={Math.max(item.product.max_quantity, item.quantity)}
                      disabled={busy !== null}
                      label={`Quantity for ${item.product.name}`}
                      onChange={(q) =>
                        mutate(item.id, () => api<Cart>(`/api/cart/items/${item.id}/`, { method: "PATCH", body: { quantity: q } }), `${item.product.name} quantity updated to ${q}.`)
                      }
                    />
                    <button
                      type="button"
                      className="btn btn-ghost !min-h-10 !px-3 text-sm text-ink-muted hover:text-danger"
                      disabled={busy !== null}
                      onClick={() => mutate(item.id, () => api<Cart>(`/api/cart/items/${item.id}/`, { method: "DELETE" }), `${item.product.name} removed from your cart.`)}
                    >
                      {busy === item.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
                      Remove<span className="sr-only"> {item.product.name}</span>
                    </button>
                  </div>
                  {item.quantity >= item.product.max_quantity && (
                    <p className="mt-2 text-xs text-ink-muted">Maximum available quantity reached.</p>
                  )}
                  {lineError?.id === item.id && <p role="alert" className="field-error">{lineError.message}</p>}
                </div>
              </li>
            ))}
          </ul>
          <Link href="/shop" className="btn btn-ghost -ml-3 mt-4">← Continue shopping</Link>
        </section>

        <aside aria-labelledby="summary-title" className="lg:col-span-4">
          <div className="card p-6 lg:sticky lg:top-28">
            <h2 id="summary-title" className="text-2xl font-medium">Order summary</h2>
            {threshold > 0 && (
              <div className="mt-5">
                <p className="text-sm text-ink-soft">
                  {remaining > 0 ? (
                    <>Add <strong className="text-ink">{formatMoney(remaining, currency)}</strong> more for free standard shipping.</>
                  ) : (
                    <strong className="text-success">You&apos;ve unlocked free standard shipping.</strong>
                  )}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand" aria-hidden>
                  <div className="h-full rounded-full bg-cobalt transition-[width] duration-500" style={{ width: `${Math.min(100, (Number(cart.subtotal) / threshold) * 100)}%` }} />
                </div>
              </div>
            )}
            <dl className="mt-6 space-y-3 text-[0.9375rem]">
              <div className="flex justify-between"><dt className="text-ink-soft">Subtotal</dt><dd className="tabular-nums">{formatMoney(cart.estimate.subtotal, currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Standard shipping</dt><dd className="tabular-nums">{Number(cart.estimate.shipping_total) === 0 ? "Free" : formatMoney(cart.estimate.shipping_total, currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">{cart.estimate.tax_label}</dt><dd className="tabular-nums">{formatMoney(cart.estimate.tax_total, currency)}</dd></div>
              <div className="flex justify-between border-t border-line pt-4 text-lg font-semibold"><dt>Estimated total</dt><dd className="tabular-nums">{formatMoney(cart.estimate.total, currency)}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-ink-muted">Final shipping is confirmed at checkout.</p>
            <Link href="/checkout" className="btn btn-primary btn-lg mt-6 w-full">
              Checkout <ArrowRight className="size-4" aria-hidden />
            </Link>
            <p className="mt-3 text-center text-xs text-ink-muted">Demo checkout — you won&apos;t be charged.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
