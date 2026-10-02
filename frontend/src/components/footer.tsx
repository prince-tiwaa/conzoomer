import Link from "next/link";

import { Wordmark } from "./logo";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "hello@conzoomer.example";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-24 border-t border-line bg-paper">
      <div className="container-page grid gap-10 py-14 md:grid-cols-12">
        <div className="md:col-span-5">
          <Wordmark className="text-3xl" />
          <p className="mt-4 max-w-sm text-ink-soft">
            A small, considered shop for everyday things across tech, home and lifestyle.
          </p>
          <p className="mt-6 inline-flex rounded-full bg-cobalt-wash px-3 py-1.5 text-sm font-medium text-cobalt-deep">
            Demo store · checkout never charges a card
          </p>
        </div>
        <nav aria-label="Shop" className="md:col-span-2">
          <h2 className="font-sans text-sm font-semibold tracking-normal text-ink">Shop</h2>
          <ul className="mt-4 space-y-3 text-ink-soft">
            <li><Link className="hover:text-ink hover:underline" href="/shop">All products</Link></li>
            <li><Link className="hover:text-ink hover:underline" href="/shop?category=tech">Tech</Link></li>
            <li><Link className="hover:text-ink hover:underline" href="/shop?category=home">Home</Link></li>
            <li><Link className="hover:text-ink hover:underline" href="/shop?category=lifestyle">Lifestyle</Link></li>
          </ul>
        </nav>
        <nav aria-label="Account" className="md:col-span-2">
          <h2 className="font-sans text-sm font-semibold tracking-normal text-ink">Your orders</h2>
          <ul className="mt-4 space-y-3 text-ink-soft">
            <li><Link className="hover:text-ink hover:underline" href="/cart">Cart</Link></li>
            <li><Link className="hover:text-ink hover:underline" href="/account">Account &amp; orders</Link></li>
            <li><Link className="hover:text-ink hover:underline" href="/signin">Sign in</Link></li>
          </ul>
        </nav>
        <div className="md:col-span-3">
          <h2 className="font-sans text-sm font-semibold tracking-normal text-ink">Contact</h2>
          <ul className="mt-4 space-y-3 text-ink-soft">
            <li>
              <a className="hover:text-ink hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
                {SUPPORT_EMAIL}
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="container-page flex flex-col gap-2 py-6 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Conzoomer. A student project — product photos via Unsplash.</p>
          <p>Tax shown at checkout uses a demo rate.</p>
        </div>
      </div>
    </footer>
  );
}
