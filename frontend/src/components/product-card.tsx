import Link from "next/link";

import type { ProductCard as Product } from "@/lib/types";

import { Price, StockBadge } from "./price";
import { ProductImage } from "./product-image";

export function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  const soldOut = product.stock_status === "out_of_stock";
  return (
    <article className="group relative flex flex-col">
      <div className="relative overflow-hidden rounded-[var(--radius-card)]">
        <ProductImage
          src={product.image?.url}
          alt={product.image?.alt || product.name}
          label={product.category.name}
          width={600}
          sizes="(min-width: 1280px) 22rem, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw"
          priority={priority}
          className={`transition-transform duration-500 ease-[var(--ease-out-soft)] motion-safe:group-hover:scale-[1.03] ${soldOut ? "grayscale" : ""}`}
        />
        {soldOut && (
          <span className="absolute left-3 top-3 rounded-full bg-paper/95 px-2.5 py-1 text-xs font-semibold text-ink">Sold out</span>
        )}
      </div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">{product.category.name}</p>
          <h3 className="mt-1 font-sans text-base font-semibold leading-snug tracking-normal text-ink">
            <Link href={`/products/${product.slug}`} className="after:absolute after:inset-0 after:rounded-[var(--radius-card)]">
              {product.name}
            </Link>
          </h3>
        </div>
        <Price amount={product.price} currency={product.currency} className="shrink-0 font-semibold" />
      </div>
      <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{product.short_description}</p>
      <StockBadge status={product.stock_status} available={product.available} className="mt-2" />
    </article>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-1 gap-x-6 gap-y-10 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <li key={i}>
          <div className="skeleton aspect-[4/5] w-full rounded-[var(--radius-card)]" />
          <div className="skeleton mt-4 h-3 w-16" />
          <div className="skeleton mt-2 h-4 w-3/4" />
          <div className="skeleton mt-2 h-3 w-1/2" />
        </li>
      ))}
    </ul>
  );
}
