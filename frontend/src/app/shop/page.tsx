import type { Metadata } from "next";
import Link from "next/link";

import { CatalogToolbar, FilterPanel, Pagination } from "@/components/catalog-controls";
import { ProductCard } from "@/components/product-card";
import { BackendError, getCategories, getProducts } from "@/lib/server";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ALLOWED = ["q", "category", "min_price", "max_price", "sort", "page", "in_stock"] as const;

function pick(sp: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const key of ALLOWED) {
    const v = sp[key];
    const value = Array.isArray(v) ? v[0] : v;
    if (value) params.set(key, value);
  }
  return params;
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const cat = typeof sp.category === "string" ? sp.category : "";
  const q = typeof sp.q === "string" ? sp.q : "";
  if (q) return { title: `Search: ${q}` };
  if (cat) return { title: cat.charAt(0).toUpperCase() + cat.slice(1) };
  return { title: "Shop all" };
}

export default async function ShopPage({ searchParams }: { searchParams: SearchParams }) {
  const params = pick(await searchParams);
  const [categories, result] = await Promise.all([
    getCategories().catch(() => []),
    getProducts(params).then(
      (data) => ({ data, error: null as null | { status: number; message: string } }),
      (e: unknown) => ({
        data: null,
        error: e instanceof BackendError ? { status: e.status, message: e.message } : { status: 500, message: "Unknown error" },
      }),
    ),
  ]);

  const data = result.data;
  const q = params.get("q");
  const heading = data?.category?.name ?? (q ? `Results for “${q}”` : "Shop all");
  const intro = data?.category?.description ?? (q ? null : "Everything in the collection, from desk to doorstep.");
  const hasFilters = ["q", "category", "min_price", "max_price", "in_stock"].some((k) => params.has(k));

  return (
    <div className="container-page pb-8 pt-10 lg:pt-14">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
        <ol className="flex items-center gap-2">
          <li><Link href="/" className="hover:text-ink hover:underline">Home</Link></li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="text-ink">{data?.category?.name ?? "Shop"}</li>
        </ol>
      </nav>
      <header className="mt-4 max-w-3xl">
        <h1 className="text-4xl font-medium sm:text-5xl">{heading}</h1>
        {intro && <p className="mt-3 text-lg text-ink-soft">{intro}</p>}
      </header>

      <div className="group/catalog mt-8 grid gap-8 lg:mt-10 lg:grid-cols-[15rem_1fr] lg:gap-12">
        <aside aria-label="Filters" className="hidden lg:block">
          <div className="sticky top-28">
            <FilterPanel categories={categories} priceBounds={data?.price_bounds ?? { min: null, max: null }} idPrefix="desk" />
          </div>
        </aside>
        <div className="min-w-0">
          <CatalogToolbar
            categories={categories}
            count={data?.count ?? 0}
            priceBounds={data?.price_bounds ?? { min: null, max: null }}
            currency={data?.results[0]?.currency ?? "USD"}
          />
          <div className="mt-8 transition-opacity duration-200 group-has-[[data-catalog-pending]]/catalog:pointer-events-none group-has-[[data-catalog-pending]]/catalog:opacity-50">
        {result.error ? (
          <div role="alert" className="card mt-2 p-8 text-center">
            <h2 className="text-2xl font-medium">
              {result.error.status === 404 ? "That category doesn't exist" : result.error.status === 400 ? "Those filters don't look right" : "We couldn't load products"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-ink-soft">{result.error.status >= 500 ? "The catalog is temporarily unavailable. Please try again in a moment." : result.error.message}</p>
            <Link href="/shop" className="btn btn-primary mt-6">Reset and show all products</Link>
          </div>
        ) : data && data.results.length === 0 ? (
          <div className="card mt-2 p-10 text-center">
            <h2 className="text-2xl font-medium">No products match</h2>
            <p className="mx-auto mt-2 max-w-md text-ink-soft">
              {q ? <>Nothing matched “{q}”. Try a broader word, or </> : <>Try widening the price range, or </>}
              clear your filters to see everything.
            </p>
            {hasFilters && <Link href="/shop" className="btn btn-primary mt-6">Clear all filters</Link>}
          </div>
        ) : data ? (
          <>
            <h2 className="sr-only">Products</h2>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-10 min-[420px]:grid-cols-2 lg:grid-cols-3">
              {data.results.map((p, i) => (
                <li key={p.id}>
                  <ProductCard product={p} priority={i < 3} />
                </li>
              ))}
            </ul>
            <Pagination page={data.page} numPages={data.num_pages} />
          </>
        ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
