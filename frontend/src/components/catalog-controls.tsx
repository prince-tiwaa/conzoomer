"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, SlidersHorizontal, X } from "lucide-react";

import { formatMoney } from "@/lib/format";
import type { Category } from "@/lib/types";

const SORTS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest arrivals" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

type Props = {
  categories: Category[];
  count: number;
  priceBounds: { min: string | null; max: string | null };
  currency: string;
};

// Navigation state shared by every filter control on the page. While a
// navigation is in flight, useSearchParams() still holds the old URL, so we
// build on the most recently requested query (quick successive changes such as
// category then sort don't overwrite each other) and expose a pending flag.
let requested: string | null = null;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const setRequested = (qs: string | null) => {
  requested = qs;
  listeners.forEach((fn) => fn());
};

function useUpdateParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.toString();
  const req = useSyncExternalStore(subscribe, () => requested, () => null);

  useEffect(() => {
    if (requested !== null) setRequested(null);
  }, [current]);

  const update = (changes: Record<string, string | null>, { resetPage = true } = {}) => {
    const next = new URLSearchParams(requested ?? current);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete("page");
    const qs = next.toString();
    if (qs === current && requested === null) return;
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    setRequested(qs);
  };
  return { params, update, pending: req !== null && req !== current };
}

export function FilterPanel({ categories, priceBounds, idPrefix }: { categories: Category[]; priceBounds: Props["priceBounds"]; idPrefix: string }) {
  const { params, update } = useUpdateParams();
  const urlCategory = params.get("category") ?? "";
  const urlInStock = params.get("in_stock") === "1";
  // Optimistic UI: reflect the choice immediately while the new results load.
  const [category, setCategory] = useState(urlCategory);
  const [inStock, setInStock] = useState(urlInStock);
  useEffect(() => setCategory(urlCategory), [urlCategory]);
  useEffect(() => setInStock(urlInStock), [urlInStock]);
  const [min, setMin] = useState(params.get("min_price") ?? "");
  const [max, setMax] = useState(params.get("max_price") ?? "");
  const [priceError, setPriceError] = useState("");

  useEffect(() => {
    setMin(params.get("min_price") ?? "");
    setMax(params.get("max_price") ?? "");
  }, [params]);

  const applyPrice = (e: React.FormEvent) => {
    e.preventDefault();
    const lo = min.trim();
    const hi = max.trim();
    if ((lo && (isNaN(Number(lo)) || Number(lo) < 0)) || (hi && (isNaN(Number(hi)) || Number(hi) < 0))) {
      setPriceError("Enter amounts of 0 or more.");
      return;
    }
    if (lo && hi && Number(lo) > Number(hi)) {
      setPriceError("Minimum can't be more than maximum.");
      return;
    }
    setPriceError("");
    update({ min_price: lo || null, max_price: hi || null });
  };

  return (
    <div className="space-y-8">
      <fieldset>
        <legend className="text-sm font-semibold text-ink">Category</legend>
        <div className="mt-3 space-y-1">
          {[{ slug: "", name: "All products", product_count: undefined } as Pick<Category, "slug" | "name" | "product_count">, ...categories].map((c) => {
            const id = `${idPrefix}-cat-${c.slug || "all"}`;
            return (
              <label key={id} htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 hover:bg-sand has-[:checked]:bg-paper has-[:checked]:font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-cobalt">
                <input
                  id={id}
                  type="radio"
                  name={`${idPrefix}-category`}
                  className="size-4 accent-[var(--color-cobalt)]"
                  checked={category === c.slug}
                  onChange={() => {
                    setCategory(c.slug);
                    update({ category: c.slug || null });
                  }}
                />
                <span className="flex-1">{c.name}</span>
                {c.product_count !== undefined && <span className="text-sm tabular-nums text-ink-muted">{c.product_count}</span>}
              </label>
            );
          })}
        </div>
      </fieldset>

      <form onSubmit={applyPrice} noValidate>
        <fieldset>
          <legend className="text-sm font-semibold text-ink">Price</legend>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${idPrefix}-min`} className="mb-1 block text-xs font-medium text-ink-muted">Min</label>
              <input
                id={`${idPrefix}-min`}
                inputMode="decimal"
                className="field-input"
                placeholder={priceBounds.min ? `${Math.floor(Number(priceBounds.min))}` : "0"}
                value={min}
                onChange={(e) => setMin(e.target.value)}
                aria-invalid={!!priceError}
                aria-describedby={priceError ? `${idPrefix}-price-err` : undefined}
              />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-max`} className="mb-1 block text-xs font-medium text-ink-muted">Max</label>
              <input
                id={`${idPrefix}-max`}
                inputMode="decimal"
                className="field-input"
                placeholder={priceBounds.max ? `${Math.ceil(Number(priceBounds.max))}` : "Any"}
                value={max}
                onChange={(e) => setMax(e.target.value)}
                aria-invalid={!!priceError}
                aria-describedby={priceError ? `${idPrefix}-price-err` : undefined}
              />
            </div>
          </div>
          {priceError && <p id={`${idPrefix}-price-err`} className="field-error">{priceError}</p>}
          <button type="submit" className="btn btn-outline mt-3 w-full">Apply price</button>
        </fieldset>
      </form>

      <div>
        <label htmlFor={`${idPrefix}-stock`} className="flex min-h-11 cursor-pointer items-center gap-3">
          <input
            id={`${idPrefix}-stock`}
            type="checkbox"
            className="size-4 accent-[var(--color-cobalt)]"
            checked={inStock}
            onChange={(e) => {
              setInStock(e.target.checked);
              update({ in_stock: e.target.checked ? "1" : null });
            }}
          />
          <span className="text-sm font-medium">Hide sold-out items</span>
        </label>
      </div>
    </div>
  );
}

export function CatalogToolbar({ categories, count, priceBounds, currency }: Props) {
  const { params, update, pending } = useUpdateParams();
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const sortId = useId();
  const urlSort = params.get("sort") ?? "featured";
  const [sort, setSort] = useState(urlSort);
  useEffect(() => setSort(urlSort), [urlSort]);

  const money = (v: string) => (isNaN(Number(v)) ? v : formatMoney(v, currency).replace(/\.00$/, ""));
  const chips: { key: string; label: string; clear: Record<string, null> }[] = [];
  const q = params.get("q");
  if (q) chips.push({ key: "q", label: `“${q}”`, clear: { q: null } });
  const cat = categories.find((c) => c.slug === params.get("category"));
  if (cat) chips.push({ key: "category", label: cat.name, clear: { category: null } });
  const lo = params.get("min_price");
  const hi = params.get("max_price");
  if (lo || hi) chips.push({ key: "price", label: lo && hi ? `${money(lo)}–${money(hi)}` : lo ? `From ${money(lo)}` : `Up to ${money(hi!)}`, clear: { min_price: null, max_price: null } });
  if (params.get("in_stock") === "1") chips.push({ key: "stock", label: "In stock only", clear: { in_stock: null } });

  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheetRef.current?.querySelector<HTMLElement>("button, input")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSheetOpen(false);
        openerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [sheetOpen]);

  const closeSheet = () => {
    setSheetOpen(false);
    openerRef.current?.focus();
  };

  return (
    <>
      {/* Marker read via CSS :has() by the results wrapper to dim stale results. */}
      {pending && <span data-catalog-pending hidden />}
      <div>
        <div className="flex flex-wrap items-center gap-3 border-b border-line pb-4">
          <button ref={openerRef} type="button" className="btn btn-outline lg:hidden" onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
            <SlidersHorizontal className="size-4" aria-hidden />
            Filters{chips.length ? ` (${chips.length})` : ""}
          </button>
          <p className="text-sm text-ink-muted" aria-live="polite">
            {pending ? "Updating…" : `${count} ${count === 1 ? "product" : "products"}`}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <label htmlFor={sortId} className="hidden text-sm text-ink-muted sm:block">Sort by</label>
            <select
              id={sortId}
              className="field-input !min-h-11 !w-auto !py-2 text-sm"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                update({ sort: e.target.value === "featured" ? null : e.target.value });
              }}
              aria-label="Sort products"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {chips.length > 0 && (
          <ul className="mt-4 flex flex-wrap items-center gap-2" aria-label="Active filters">
            {chips.map((chip) => (
              <li key={chip.key}>
                <button
                  type="button"
                  onClick={() => update(chip.clear)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line-strong bg-paper pl-3 pr-2 text-sm font-medium hover:border-ink"
                  aria-label={`Remove filter: ${chip.label}`}
                >
                  {chip.label}
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
            <li>
              <Link href="/shop" className="ml-1 text-sm font-semibold text-cobalt hover:underline">Clear all</Link>
            </li>
          </ul>
        )}

      </div>

      {/* Mobile filter sheet */}
      <div hidden={!sheetOpen} className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-labelledby="filters-title">
        <div className="absolute inset-0 bg-ink/30" onClick={closeSheet} aria-hidden />
        <div ref={sheetRef} className="animate-rise absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-[1.75rem] bg-ivory shadow-[var(--shadow-lift)]">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 id="filters-title" className="text-2xl font-medium">Filters</h2>
            <button type="button" className="icon-btn -mr-2" onClick={closeSheet} aria-label="Close filters">
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-6">
            <FilterPanel categories={categories} priceBounds={priceBounds} idPrefix="sheet" />
          </div>
          <div className="flex gap-3 border-t border-line px-5 py-4">
            <Link href="/shop" className="btn btn-outline flex-1" onClick={() => setSheetOpen(false)}>Clear</Link>
            <button type="button" className="btn btn-primary flex-[2]" onClick={closeSheet}>
              {pending ? "Updating…" : `Show ${count} ${count === 1 ? "product" : "products"}`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function Pagination({ page, numPages }: { page: number; numPages: number }) {
  const params = useSearchParams();
  if (numPages <= 1) return null;
  const href = (p: number) => {
    const next = new URLSearchParams(params.toString());
    if (p <= 1) next.delete("page");
    else next.set("page", String(p));
    const qs = next.toString();
    return qs ? `/shop?${qs}` : "/shop";
  };
  const pages = Array.from({ length: numPages }, (_, i) => i + 1);
  return (
    <nav aria-label="Pagination" className="mt-14 flex items-center justify-center gap-1">
      {page > 1 ? (
        <Link href={href(page - 1)} className="icon-btn" aria-label="Previous page"><ChevronLeft className="size-5" aria-hidden /></Link>
      ) : (
        <span className="icon-btn opacity-30" aria-hidden><ChevronLeft className="size-5" /></span>
      )}
      {pages.map((p) => (
        <Link
          key={p}
          href={href(p)}
          aria-current={p === page ? "page" : undefined}
          aria-label={`Page ${p}`}
          className={`inline-flex size-11 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${p === page ? "bg-ink text-ivory" : "hover:bg-sand"}`}
        >
          {p}
        </Link>
      ))}
      {page < numPages ? (
        <Link href={href(page + 1)} className="icon-btn" aria-label="Next page"><ChevronRight className="size-5" aria-hidden /></Link>
      ) : (
        <span className="icon-btn opacity-30" aria-hidden><ChevronRight className="size-5" /></span>
      )}
    </nav>
  );
}
