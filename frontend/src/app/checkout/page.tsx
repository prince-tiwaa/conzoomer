"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

import { Notice } from "@/components/notice";
import { ProductImage } from "@/components/product-image";
import { useFeedback, useSession } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { formatMoney, pluralize } from "@/lib/format";
import type { Address, Cart, CartNotice, CheckoutConfig, OrderDetail, Totals } from "@/lib/types";

type AddressForm = Omit<Address, "country_name" | "phone">;
type Errors = Record<string, string>;

const EMPTY_ADDRESS: AddressForm = { full_name: "", line1: "", line2: "", city: "", region: "", postal_code: "", country: "US" };
const KEY_STORAGE = "cz_checkout_key";
const POSTAL_OPTIONAL = new Set(["NG", "IE"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function newKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID().replace(/-/g, "");
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

/** One idempotency key per checkout attempt; survives a refresh, cleared on success. */
function getCheckoutKey() {
  try {
    const existing = sessionStorage.getItem(KEY_STORAGE);
    if (existing) return existing;
    const key = newKey();
    sessionStorage.setItem(KEY_STORAGE, key);
    return key;
  } catch {
    return newKey();
  }
}

function validateAddress(a: AddressForm, prefix: string): Errors {
  const e: Errors = {};
  if (a.full_name.trim().length < 2) e[`${prefix}.full_name`] = "Enter the recipient's full name.";
  if (!a.line1.trim()) e[`${prefix}.line1`] = "Enter the street address.";
  if (!a.city.trim()) e[`${prefix}.city`] = "Enter the town or city.";
  if (a.country === "US" && !a.region.trim()) e[`${prefix}.region`] = "Enter a state.";
  if (!POSTAL_OPTIONAL.has(a.country) && !a.postal_code.trim()) e[`${prefix}.postal_code`] = "Enter a postal code.";
  else if (a.country === "US" && a.postal_code.trim() && !/^\d{5}(-\d{4})?$/.test(a.postal_code.trim()))
    e[`${prefix}.postal_code`] = "Enter a 5-digit ZIP code.";
  return e;
}

/** Flatten nested API field errors into "shipping_address.city" style keys. */
function flattenFields(fields: Record<string, unknown> | undefined, prefix = ""): Errors {
  const out: Errors = {};
  if (!fields) return out;
  for (const [k, v] of Object.entries(fields)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, flattenFields(v as Record<string, unknown>, key));
    else out[key] = String(v);
  }
  return out;
}

function Field({
  id,
  label,
  error,
  hint,
  optional,
  children,
  className = "",
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">
        {label} {optional && <span className="font-normal text-ink-muted">(optional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="field-error">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}

function AddressFields({
  prefix,
  value,
  onChange,
  errors,
  countries,
  autoSection,
}: {
  prefix: string;
  value: AddressForm;
  onChange: (a: AddressForm) => void;
  errors: Errors;
  countries: CheckoutConfig["countries"];
  autoSection: "shipping" | "billing";
}) {
  const set = (k: keyof AddressForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...value, [k]: e.target.value });
  const id = (k: string) => `${prefix}-${k}`;
  const err = (k: string) => errors[`${prefix}.${k}`];
  const describe = (k: string) => (err(k) ? `${id(k)}-error` : undefined);
  const ac = (token: string) => `section-${autoSection} ${autoSection} ${token}`;
  const isUS = value.country === "US";

  return (
    <div className="grid grid-cols-6 gap-x-4 gap-y-5">
      <Field id={id("full_name")} label="Full name" error={err("full_name")} className="col-span-6">
        <input id={id("full_name")} name={id("full_name")} className="field-input" autoComplete={ac("name")} value={value.full_name} onChange={set("full_name")} aria-invalid={!!err("full_name")} aria-describedby={describe("full_name")} required />
      </Field>
      <Field id={id("country")} label="Country" error={err("country")} className="col-span-6">
        <select id={id("country")} name={id("country")} className="field-input" autoComplete={ac("country")} value={value.country} onChange={set("country")} aria-invalid={!!err("country")} aria-describedby={describe("country")}>
          {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </Field>
      <Field id={id("line1")} label="Street address" error={err("line1")} className="col-span-6">
        <input id={id("line1")} name={id("line1")} className="field-input" autoComplete={ac("address-line1")} value={value.line1} onChange={set("line1")} aria-invalid={!!err("line1")} aria-describedby={describe("line1")} required />
      </Field>
      <Field id={id("line2")} label="Apartment, suite, etc." optional error={err("line2")} className="col-span-6">
        <input id={id("line2")} name={id("line2")} className="field-input" autoComplete={ac("address-line2")} value={value.line2} onChange={set("line2")} />
      </Field>
      <Field id={id("city")} label="Town or city" error={err("city")} className="col-span-6 sm:col-span-2">
        <input id={id("city")} name={id("city")} className="field-input" autoComplete={ac("address-level2")} value={value.city} onChange={set("city")} aria-invalid={!!err("city")} aria-describedby={describe("city")} required />
      </Field>
      <Field id={id("region")} label={isUS ? "State" : "State / county"} optional={!isUS} error={err("region")} className="col-span-3 sm:col-span-2">
        <input id={id("region")} name={id("region")} className="field-input" autoComplete={ac("address-level1")} value={value.region} onChange={set("region")} aria-invalid={!!err("region")} aria-describedby={describe("region")} required={isUS} />
      </Field>
      <Field id={id("postal_code")} label={isUS ? "ZIP code" : "Postal code"} optional={POSTAL_OPTIONAL.has(value.country)} error={err("postal_code")} className="col-span-3 sm:col-span-2">
        <input id={id("postal_code")} name={id("postal_code")} className="field-input" autoComplete={ac("postal-code")} inputMode={isUS ? "numeric" : "text"} value={value.postal_code} onChange={set("postal_code")} aria-invalid={!!err("postal_code")} aria-describedby={describe("postal_code")} />
      </Field>
    </div>
  );
}

function Section({ step, title, children, aside }: { step: number; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section aria-labelledby={`step-${step}`} className="border-t border-line pt-8 first:border-t-0 first:pt-0">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`step-${step}`} className="flex items-baseline gap-3 text-2xl font-medium">
          <span className="font-sans text-sm font-semibold tabular-nums text-cobalt" aria-hidden>0{step}</span>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const { session, setCartCount, loading: sessionLoading } = useSession();
  const { announce } = useFeedback();

  const [cart, setCart] = useState<Cart | null>(null);
  const [config, setConfig] = useState<CheckoutConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [shipping, setShipping] = useState<AddressForm>(EMPTY_ADDRESS);
  const [billingSame, setBillingSame] = useState(true);
  const [billing, setBilling] = useState<AddressForm>(EMPTY_ADDRESS);
  const [method, setMethod] = useState("standard");

  const [totals, setTotals] = useState<Totals | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [notices, setNotices] = useState<CartNotice[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<{ title: string; body?: React.ReactNode } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const submittingRef = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const prefilled = useRef(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [c, cfg] = await Promise.all([api<Cart>("/api/cart/"), api<CheckoutConfig>("/api/checkout/config/")]);
      setCart(c);
      setConfig(cfg);
      setNotices(c.notices);
      setCartCount(c.item_count);
      if (cfg.prefill && !prefilled.current) {
        prefilled.current = true;
        setEmail((v) => v || cfg.prefill!.email);
        setShipping((s) => (s.full_name ? s : { ...s, full_name: cfg.prefill!.full_name }));
      }
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "We couldn't load checkout.");
    }
  }, [setCartCount]);

  useEffect(() => {
    document.title = "Checkout · Conzoomer";
    load();
  }, [load]);

  const quote = useCallback(async (shippingMethod: string) => {
    setQuoting(true);
    try {
      const q = await api<{ totals: Totals; notices: CartNotice[]; empty: boolean }>("/api/checkout/quote/", {
        method: "POST",
        body: { shipping_method: shippingMethod },
      });
      setTotals(q.totals);
      if (q.notices.length) {
        setNotices((n) => [...n, ...q.notices]);
        announce(q.notices.map((n) => n.message).join(" "));
        const c = await api<Cart>("/api/cart/");
        setCart(c);
        setCartCount(c.item_count);
      }
    } catch {
      setTotals(null);
    } finally {
      setQuoting(false);
    }
  }, [announce, setCartCount]);

  useEffect(() => {
    if (cart && cart.items.length) quote(method);
  }, [method, cart?.item_count, quote]); // eslint-disable-line react-hooks/exhaustive-deps

  const currency = cart?.currency ?? "USD";
  const shownTotals = totals ?? cart?.estimate ?? null;

  // Clear a field's error as soon as the shopper edits it.
  const clearErrors = (...keys: string[]) =>
    setErrors((prev) => {
      if (!keys.some((k) => k in prev)) return prev;
      const next = { ...prev };
      keys.forEach((k) => delete next[k]);
      return next;
    });
  const changeAddress = (which: "shipping_address" | "billing_address", prev: AddressForm, next: AddressForm) => {
    const changed = (Object.keys(next) as (keyof AddressForm)[]).filter((k) => next[k] !== prev[k]).map((k) => `${which}.${k}`);
    clearErrors(...changed, which);
    (which === "shipping_address" ? setShipping : setBilling)(next);
  };

  const clientValidate = (): Errors => {
    const e: Errors = {};
    if (!email.trim()) e.email = "Enter your email address.";
    else if (!EMAIL_RE.test(email.trim())) e.email = "Enter a valid email address, like name@example.com.";
    if (phone.trim() && !/^[0-9+()\-.\s]{7,30}$/.test(phone.trim())) e.phone = "Enter a valid phone number.";
    Object.assign(e, validateAddress(shipping, "shipping_address"));
    if (!billingSame) Object.assign(e, validateAddress(billing, "billing_address"));
    return e;
  };

  const focusFirstError = (errs: Errors) => {
    const first = Object.keys(errs)[0];
    if (!first) return;
    const id = first.replace("shipping_address.", "ship-").replace("billing_address.", "bill-");
    window.requestAnimationFrame(() => document.getElementById(id)?.focus());
  };

  const showFormError = (title: string, body?: React.ReactNode) => {
    setFormError({ title, body });
    window.requestAnimationFrame(() => errorRef.current?.focus());
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return; // guard against double clicks / double Enter
    setFormError(null);
    const errs = clientValidate();
    setErrors(errs);
    if (Object.keys(errs).length) {
      announce(`Please fix ${pluralize(Object.keys(errs).length, "field")} before placing your order.`);
      focusFirstError(errs);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const strip = (a: AddressForm) => ({ ...a, postal_code: a.postal_code.trim(), region: a.region.trim() });
      const result = await api<{ order: OrderDetail; access_token: string | null; replayed: boolean }>("/api/checkout/", {
        method: "POST",
        headers: { "Idempotency-Key": getCheckoutKey() },
        body: {
          email: email.trim(),
          phone: phone.trim(),
          shipping_address: strip(shipping),
          billing_same_as_shipping: billingSame,
          billing_address: billingSame ? null : strip(billing),
          shipping_method: method,
          expected_total: shownTotals?.total ?? null,
        },
      });
      try {
        sessionStorage.removeItem(KEY_STORAGE);
      } catch {}
      setCartCount(0);
      announce("Order placed. Loading your confirmation.");
      router.replace(`/orders/${result.order.reference}?placed=1`);
      return; // keep the button disabled while navigating
    } catch (err) {
      submittingRef.current = false;
      setSubmitting(false);
      if (!(err instanceof ApiError)) {
        showFormError("Something went wrong", "Please try again.");
        return;
      }
      switch (err.code) {
        case "validation_error": {
          const fieldErrs = flattenFields(err.body.fields);
          setErrors(fieldErrs);
          showFormError("Please check your details", err.body.message);
          focusFirstError(fieldErrs);
          break;
        }
        case "insufficient_stock":
          showFormError("Some items just sold out", (
            <>
              <ul className="list-disc pl-5">{err.body.items?.map((i) => <li key={i.product_id}>{i.message}</li>)}</ul>
              <p className="mt-2">Your cart hasn&apos;t been charged or emptied. <Link className="link" href="/cart">Review your cart</Link> to continue.</p>
            </>
          ));
          load();
          break;
        case "totals_changed":
          if (err.body.totals) setTotals(err.body.totals);
          showFormError("Your total has changed", "Prices or shipping were updated since you started checkout. Please review the new total and place your order again.");
          load();
          break;
        case "cart_empty":
          showFormError("Your cart is empty", <Link className="link" href="/shop">Continue shopping</Link>);
          load();
          break;
        case "rate_limited":
          showFormError("Too many attempts", "Please wait a minute before trying again.");
          break;
        case "csrf_failed":
          showFormError("Your session expired", "Refresh the page and try again — your cart is saved.");
          break;
        case "network_error":
          showFormError("Connection problem", "We couldn't reach the store. Your order wasn't placed twice — it's safe to try again.");
          break;
        default:
          showFormError("We couldn't place your order", err.message);
      }
    }
  };

  const signInHref = useMemo(() => "/signin?next=/checkout", []);

  /* ---------------- render states ---------------- */

  if (loadError) {
    return (
      <div className="container-page py-16">
        <h1 className="text-4xl font-medium">Checkout</h1>
        <Notice tone="error" role="alert" title="We couldn't load checkout" className="mt-6 max-w-xl">
          <p>{loadError}</p>
          <button type="button" onClick={load} className="btn btn-outline mt-3 !min-h-9 text-sm">Try again</button>
        </Notice>
      </div>
    );
  }

  if (!cart || !config) {
    return (
      <div className="container-page py-12" aria-busy="true" aria-label="Loading checkout">
        <div className="skeleton h-12 w-48" />
        <div className="mt-10 grid gap-10 lg:grid-cols-12">
          <div className="space-y-5 lg:col-span-7">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
          <div className="skeleton h-80 lg:col-span-5" />
        </div>
      </div>
    );
  }

  if (cart.items.length === 0 && !submitting) {
    return (
      <div className="container-page py-20 text-center">
        <h1 className="text-4xl font-medium">Your cart is empty</h1>
        <p className="mt-3 text-ink-soft">Add something to your cart to check out.</p>
        {notices.length > 0 && (
          <div className="mx-auto mt-6 max-w-md space-y-2 text-left" role="status">{notices.map((n, i) => <Notice key={i} tone="warn">{n.message}</Notice>)}</div>
        )}
        <Link href="/shop" className="btn btn-primary btn-lg mt-8">Shop the collection</Link>
      </div>
    );
  }

  const summary = (
    <div>
      <ul className="divide-y divide-line">
        {cart.items.map((item) => (
          <li key={item.id} className="flex gap-4 py-4 first:pt-0">
            <div className="relative w-16 shrink-0">
              <div className="overflow-hidden rounded-xl">
                <ProductImage src={item.product.image?.url} alt="" width={160} label={item.product.category} />
              </div>
              <span className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-ink text-xs font-semibold text-ivory" aria-hidden>{item.quantity}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-snug">{item.product.name}</p>
              <p className="text-sm text-ink-muted">Qty {item.quantity} · {formatMoney(item.unit_price, currency)} each</p>
            </div>
            <p className="font-medium tabular-nums">{formatMoney(item.line_total, currency)}</p>
          </li>
        ))}
      </ul>
      {shownTotals && (
        <dl className={`mt-4 space-y-3 border-t border-line pt-4 text-[0.9375rem] transition-opacity ${quoting ? "opacity-60" : ""}`} aria-busy={quoting} aria-live="polite">
          <div className="flex justify-between"><dt className="text-ink-soft">Subtotal</dt><dd className="tabular-nums">{formatMoney(shownTotals.subtotal, currency)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">Shipping · {shownTotals.shipping_method_label}</dt><dd className="tabular-nums">{Number(shownTotals.shipping_total) === 0 ? "Free" : formatMoney(shownTotals.shipping_total, currency)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-ink-soft">{shownTotals.tax_label} ({(Number(shownTotals.tax_rate) * 100).toFixed(1).replace(/\.0$/, "")}%)</dt><dd className="tabular-nums">{formatMoney(shownTotals.tax_total, currency)}</dd></div>
          <div className="flex justify-between border-t border-line pt-4 text-lg font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(shownTotals.total, currency)}</dd></div>
        </dl>
      )}
    </div>
  );

  return (
    <div className="container-page py-8 lg:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/cart" className="text-sm font-medium text-ink-muted hover:text-ink hover:underline">← Back to cart</Link>
          <h1 className="mt-2 text-4xl font-medium sm:text-5xl">Checkout</h1>
        </div>
      </div>

      {/* Mobile summary toggle */}
      <div className="card mt-6 lg:hidden">
        <button type="button" className="flex w-full items-center justify-between gap-3 p-4 text-left" aria-expanded={summaryOpen} aria-controls="mobile-summary" onClick={() => setSummaryOpen((v) => !v)}>
          <span className="font-semibold">{summaryOpen ? "Hide" : "Show"} order summary <span className="font-normal text-ink-muted">({pluralize(cart.item_count, "item")})</span></span>
          <span className="flex items-center gap-2 font-semibold tabular-nums">
            {shownTotals ? formatMoney(shownTotals.total, currency) : ""}
            <ChevronDown className={`size-4 transition-transform ${summaryOpen ? "rotate-180" : ""}`} aria-hidden />
          </span>
        </button>
        <div id="mobile-summary" hidden={!summaryOpen} className="border-t border-line p-4">{summary}</div>
      </div>

      {notices.length > 0 && (
        <div className="mt-6 space-y-2" role="status">
          {notices.map((n, i) => <Notice key={i} tone="warn">{n.message}</Notice>)}
        </div>
      )}

      <form onSubmit={submit} noValidate className="mt-8 grid gap-10 lg:grid-cols-12 lg:gap-14">
        <div className="space-y-10 lg:col-span-7">
          {formError && (
            <div ref={errorRef} tabIndex={-1} className="focus:outline-none">
              <Notice tone="error" role="alert" title={formError.title}>{formError.body}</Notice>
            </div>
          )}

          <Section
            step={1}
            title="Contact"
            aside={
              !sessionLoading && !session?.user && session?.google_enabled ? (
                <p className="text-sm text-ink-muted">Have an account? <Link href={signInHref} className="link font-medium">Sign in with Google</Link></p>
              ) : session?.user ? (
                <p className="text-sm text-ink-muted">Signed in as <strong className="text-ink">{session.user.email}</strong></p>
              ) : null
            }
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="email" label="Email" error={errors.email} hint="We'll send your order confirmation here." className="sm:col-span-2">
                <input id="email" name="email" type="email" inputMode="email" autoComplete="email" className="field-input" value={email} onChange={(e) => { setEmail(e.target.value); clearErrors("email"); }} aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : "email-hint"} required />
              </Field>
              <Field id="phone" label="Phone" optional error={errors.phone} hint="Only used for delivery questions." className="sm:col-span-2">
                <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" className="field-input" value={phone} onChange={(e) => { setPhone(e.target.value); clearErrors("phone"); }} aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "phone-error" : "phone-hint"} />
              </Field>
            </div>
            {!session?.user && <p className="mt-4 text-sm text-ink-muted">Checking out as a guest. You don&apos;t need an account to place an order.</p>}
          </Section>

          <Section step={2} title="Shipping address">
            <AddressFields prefix="ship" value={shipping} onChange={(a) => changeAddress("shipping_address", shipping, a)} errors={Object.fromEntries(Object.entries(errors).map(([k, v]) => [k.replace("shipping_address.", "ship."), v]))} countries={config.countries} autoSection="shipping" />
          </Section>

          <Section step={3} title="Shipping method">
            <fieldset>
              <legend className="sr-only">Choose a shipping method</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {config.shipping_methods.map((m) => {
                  const live = totals && totals.shipping_method === m.code ? totals.shipping_total : m.price;
                  return (
                    <label key={m.code} className="relative flex cursor-pointer gap-3 rounded-2xl border border-line-strong bg-paper p-4 transition-colors hover:border-ink has-[:checked]:border-cobalt has-[:checked]:shadow-[0_0_0_1px_var(--color-cobalt)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-cobalt has-[:focus-visible]:ring-offset-2">
                      <input type="radio" name="shipping_method" value={m.code} checked={method === m.code} onChange={() => setMethod(m.code)} className="mt-1 size-4 accent-[var(--color-cobalt)]" />
                      <span className="flex-1">
                        <span className="flex justify-between gap-2 font-semibold"><span>{m.label}</span><span className="tabular-nums">{Number(live) === 0 ? "Free" : formatMoney(live, currency)}</span></span>
                        <span className="mt-0.5 block text-sm text-ink-muted">{m.description}{m.free_over_threshold && Number(config.free_shipping_threshold) > 0 ? ` · free over ${formatMoney(config.free_shipping_threshold, currency).replace(/\.00$/, "")}` : ""}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {errors.shipping_method && <p className="field-error">{errors.shipping_method}</p>}
            </fieldset>
          </Section>

          <Section step={4} title="Billing">
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <input type="checkbox" className="size-4 accent-[var(--color-cobalt)]" checked={billingSame} onChange={(e) => { setBillingSame(e.target.checked); clearErrors("billing_address"); }} />
              <span className="font-medium">Billing address is the same as shipping</span>
            </label>
            {!billingSame && (
              <div className="mt-6">
                <AddressFields prefix="bill" value={billing} onChange={(a) => changeAddress("billing_address", billing, a)} errors={Object.fromEntries(Object.entries(errors).map(([k, v]) => [k.replace("billing_address.", "bill."), v]))} countries={config.countries} autoSection="billing" />
              </div>
            )}
            {errors.billing_address && <p className="field-error">{errors.billing_address}</p>}
          </Section>

          <div className="border-t border-line pt-8 lg:hidden">{summary}</div>

          <div>
            <button type="submit" className="btn btn-primary btn-lg w-full" disabled={submitting || quoting} aria-disabled={submitting || quoting}>
              {submitting ? (
                <><Loader2 className="size-5 animate-spin" aria-hidden /> Placing your order…</>
              ) : (
                <>Place order{shownTotals ? ` · ${formatMoney(shownTotals.total, currency)}` : ""}</>
              )}
            </button>
          </div>
        </div>

        <aside aria-labelledby="summary-title" className="hidden lg:col-span-5 lg:block">
          <div className="card sticky top-28 p-6">
            <h2 id="summary-title" className="mb-5 text-2xl font-medium">Order review</h2>
            {summary}
          </div>
        </aside>
      </form>
    </div>
  );
}
