import Link from "next/link";
import { ArrowRight, PackageCheck, Receipt, Sparkles } from "lucide-react";

import { ProductCard } from "@/components/product-card";
import { ProductImage } from "@/components/product-image";
import { getCategories, getProducts } from "@/lib/server";
import type { Category, ProductCard as Product } from "@/lib/types";

export const dynamic = "force-dynamic";

async function load(): Promise<{ categories: Category[]; featured: Product[]; error: boolean }> {
  try {
    const [categories, featured] = await Promise.all([
      getCategories(),
      getProducts(new URLSearchParams({ featured: "1", page_size: "8", sort: "newest" })),
    ]);
    return { categories, featured: featured.results, error: false };
  } catch {
    return { categories: [], featured: [], error: true };
  }
}

export default async function HomePage() {
  const { categories, featured, error } = await load();
  const heroImages = featured.slice(0, 3);

  return (
    <>
      {/* Hero ------------------------------------------------------------ */}
      <section className="container-page grid items-center gap-10 pb-16 pt-10 sm:pt-14 lg:grid-cols-12 lg:gap-12 lg:pb-24 lg:pt-20">
        <div className="lg:col-span-6">
          <p className="eyebrow animate-rise">Tech · Home · Lifestyle</p>
          <h1 className="animate-rise mt-4 text-[2.75rem] font-medium leading-[1.02] sm:text-6xl lg:text-[4.75rem]">
            Everyday things, <em className="font-normal text-cobalt [font-variation-settings:'SOFT'_100,'WONK'_1]">chosen with care.</em>
          </h1>
          <p className="animate-rise mt-6 max-w-xl text-lg leading-relaxed text-ink-soft [animation-delay:80ms]">
            Conzoomer is a small, edited shop of well-made gadgets, homeware and carry essentials — fewer options,
            each one worth owning.
          </p>
          <div className="animate-rise mt-8 flex flex-wrap items-center gap-3 [animation-delay:140ms]">
            <Link href="/shop" className="btn btn-primary btn-lg">
              Shop the collection
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link href="#categories" className="btn btn-outline btn-lg">
              Browse categories
            </Link>
          </div>
        </div>

        <div className="lg:col-span-6" aria-hidden={heroImages.length === 0}>
          {heroImages.length >= 3 ? (
            <div className="grid grid-cols-5 items-start gap-3 sm:gap-4">
              <Link href={`/products/${heroImages[0].slug}`} className="col-span-3 block overflow-hidden rounded-[1.75rem]" aria-label={heroImages[0].name}>
                <ProductImage src={heroImages[0].image?.url} alt="" width={720} priority sizes="(min-width:1024px) 30vw, 60vw" label={heroImages[0].category.name} ratio={1.42} />
              </Link>
              <div className="col-span-2 flex flex-col gap-3 sm:gap-4">
                {heroImages.slice(1, 3).map((p, i) => (
                  <Link key={p.id} href={`/products/${p.slug}`} className="block overflow-hidden rounded-[1.75rem]" aria-label={p.name}>
                    <ProductImage src={p.image?.url} alt="" width={480} priority={i === 0} sizes="(min-width:1024px) 20vw, 40vw" label={p.category.name} ratio={1.02} />
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="aspect-[5/4] rounded-[1.75rem] bg-sand" />
          )}
        </div>
      </section>

      {error && (
        <div className="container-page">
          <div role="alert" className="rounded-2xl border border-warn/30 bg-warn-wash p-5 text-warn">
            <p className="font-semibold">The catalog is temporarily unavailable.</p>
            <p className="mt-1 text-sm">Please refresh in a moment. If you&apos;re running locally, make sure the Django server is running.</p>
          </div>
        </div>
      )}

      {/* Categories ------------------------------------------------------ */}
      {categories.length > 0 && (
        <section id="categories" aria-labelledby="categories-title" className="container-page scroll-mt-24 py-12 lg:py-16">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="eyebrow">Shop by category</p>
              <h2 id="categories-title" className="mt-3 text-3xl font-medium sm:text-4xl">Three rooms, one standard.</h2>
            </div>
          </div>
          <ul className="mt-8 grid gap-4 sm:grid-cols-3 sm:gap-5">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link href={`/shop?category=${c.slug}`} className="group relative block overflow-hidden rounded-[var(--radius-card)]">
                  <ProductImage src={c.image_url} alt="" width={640} sizes="(min-width:640px) 32vw, 92vw" label={c.name} ratio={1.1} className="transition-transform duration-500 motion-safe:group-hover:scale-[1.03]" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 via-ink/40 to-transparent p-5 pt-16 text-ivory">
                    <h3 className="text-2xl font-medium">{c.name}</h3>
                    <p className="mt-1 text-sm text-ivory/90">{c.tagline}</p>
                    <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold">
                      {c.product_count} products <ArrowRight className="size-4 transition-transform motion-safe:group-hover:translate-x-1" aria-hidden />
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Featured -------------------------------------------------------- */}
      {featured.length > 0 && (
        <section aria-labelledby="featured-title" className="container-page py-12 lg:py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Featured</p>
              <h2 id="featured-title" className="mt-3 text-3xl font-medium sm:text-4xl">Worth a closer look</h2>
            </div>
            <Link href="/shop" className="btn btn-ghost -mr-3">
              View all products <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <ul className="mt-8 grid grid-cols-1 gap-x-6 gap-y-10 min-[420px]:grid-cols-2 lg:grid-cols-4">
            {featured.slice(0, 4).map((p) => (
              <li key={p.id}>
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Brand story ----------------------------------------------------- */}
      <section aria-labelledby="story-title" className="container-page py-12 lg:py-16">
        <div className="grid gap-10 rounded-[2rem] bg-ink px-6 py-12 text-ivory sm:px-10 lg:grid-cols-12 lg:gap-16 lg:px-14 lg:py-16">
          <div className="lg:col-span-5">
            <p className="eyebrow !text-[#9fb0ff]">Why Conzoomer</p>
            <h2 id="story-title" className="mt-4 text-4xl font-medium leading-tight sm:text-5xl">
              Fewer, better things.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-ivory/80">
              We keep the range small on purpose. Every product earns its place by being useful, well made and pleasant
              to live with — so choosing is easy.
            </p>
          </div>
          <ul className="grid gap-8 sm:grid-cols-3 lg:col-span-7 lg:gap-6">
            {[
              { icon: Sparkles, title: "An edited range", body: "A short list of products across three categories. No endless scrolling." },
              { icon: Receipt, title: "Clear totals, up front", body: "Shipping and tax are calculated before you place an order — no surprises at the end." },
              { icon: PackageCheck, title: "Free standard shipping", body: "On orders over the free-shipping threshold, shown in your cart as you shop." },
            ].map(({ icon: Icon, title, body }) => (
              <li key={title} className="border-t border-ivory/20 pt-5">
                <Icon className="size-6 text-[#9fb0ff]" aria-hidden />
                <h3 className="mt-4 font-sans text-lg font-semibold tracking-normal">{title}</h3>
                <p className="mt-2 text-ivory/75">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
