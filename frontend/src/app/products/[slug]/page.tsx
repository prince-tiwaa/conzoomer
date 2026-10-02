import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, ShieldCheck, Truck } from "lucide-react";

import { AddToCart } from "@/components/add-to-cart";
import { Price, StockBadge } from "@/components/price";
import { ProductCard } from "@/components/product-card";
import { ProductGallery } from "@/components/product-gallery";
import { BackendError, getProduct } from "@/lib/server";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

async function load(slug: string) {
  try {
    return await getProduct(slug);
  } catch (e) {
    if (e instanceof BackendError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const { product } = await getProduct(slug);
    return { title: product.name, description: product.short_description };
  } catch {
    return { title: "Product" };
  }
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const { product, related } = await load(slug);

  return (
    <div className="container-page pt-8 lg:pt-12">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link href="/shop" className="hover:text-ink hover:underline">Shop</Link></li>
          <li aria-hidden>/</li>
          <li><Link href={`/shop?category=${product.category.slug}`} className="hover:text-ink hover:underline">{product.category.name}</Link></li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="text-ink">{product.name}</li>
        </ol>
      </nav>

      <div className="mt-6 grid gap-10 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-7">
          <ProductGallery images={product.images} name={product.name} category={product.category.name} />
        </div>

        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-28">
            <Link href={`/shop?category=${product.category.slug}`} className="eyebrow hover:underline">{product.category.name}</Link>
            <h1 className="mt-3 text-4xl font-medium leading-[1.05] sm:text-5xl">{product.name}</h1>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
              <Price amount={product.price} currency={product.currency} className="text-2xl font-semibold" />
              <StockBadge status={product.stock_status} available={product.available} />
            </div>
            <p className="mt-5 text-lg leading-relaxed text-ink-soft">{product.short_description}</p>

            <AddToCart productId={product.id} productName={product.name} maxQuantity={product.max_quantity} />

            <ul className="mt-8 space-y-3 border-t border-line pt-6 text-sm text-ink-soft">
              <li className="flex gap-3"><Truck className="size-5 shrink-0 text-ink" aria-hidden />Standard and express shipping options, with costs shown before you place your order.</li>
              <li className="flex gap-3"><ShieldCheck className="size-5 shrink-0 text-ink" aria-hidden />Demo checkout — no card details are collected and nothing is charged.</li>
              <li className="flex gap-3"><Mail className="size-5 shrink-0 text-ink" aria-hidden />Questions about an order? Contact us from the link in the footer.</li>
            </ul>
          </div>
        </div>
      </div>

      <section aria-labelledby="about-title" className="mt-16 grid gap-10 border-t border-line pt-12 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-7">
          <h2 id="about-title" className="text-3xl font-medium">About this product</h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">{product.description}</p>
        </div>
        {product.details.length > 0 && (
          <div className="lg:col-span-5">
            <h2 className="font-sans text-sm font-semibold uppercase tracking-[0.14em] text-ink-muted">Details</h2>
            <dl className="mt-4 divide-y divide-line border-y border-line">
              {product.details.map((d) => (
                <div key={d.label} className="grid grid-cols-[8.5rem_1fr] gap-4 py-3.5 text-[0.9375rem]">
                  <dt className="text-ink-muted">{d.label}</dt>
                  <dd className="text-ink">{d.value}</dd>
                </div>
              ))}
              <div className="grid grid-cols-[8.5rem_1fr] gap-4 py-3.5 text-[0.9375rem]">
                <dt className="text-ink-muted">SKU</dt>
                <dd className="font-mono text-sm text-ink">{product.sku}</dd>
              </div>
            </dl>
          </div>
        )}
      </section>

      {related.length > 0 && (
        <section aria-labelledby="related-title" className="mt-20">
          <h2 id="related-title" className="text-3xl font-medium">You might also like</h2>
          <ul className="mt-8 grid grid-cols-1 gap-x-6 gap-y-10 min-[420px]:grid-cols-2 lg:grid-cols-4">
            {related.map((p) => (
              <li key={p.id}><ProductCard product={p} /></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
