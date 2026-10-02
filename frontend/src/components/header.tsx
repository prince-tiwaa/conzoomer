"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useId, useRef, useState } from "react";
import { Menu, Search, ShoppingBag, User, X } from "lucide-react";

import { Logo } from "./logo";
import { useSession } from "./providers";

const NAV = [
  { href: "/shop", label: "Shop all" },
  { href: "/shop?category=tech", label: "Tech" },
  { href: "/shop?category=home", label: "Home" },
  { href: "/shop?category=lifestyle", label: "Lifestyle" },
];

function SearchForm({ id, autoFocus = false, onDone }: { id: string; autoFocus?: boolean; onDone?: () => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const current = pathname === "/shop" ? params.get("q") ?? "" : "";
  const [value, setValue] = useState(current);
  useEffect(() => setValue(current), [current]);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        router.push(q ? `/shop?q=${encodeURIComponent(q)}` : "/shop");
        onDone?.();
      }}
      className="relative w-full"
    >
      <label htmlFor={id} className="sr-only">
        Search products
      </label>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search products"
        autoFocus={autoFocus}
        autoComplete="off"
        enterKeyHint="search"
        className="h-11 w-full rounded-full border border-line bg-paper pl-10 pr-4 text-[0.9375rem] placeholder:text-ink-muted/80 focus:border-cobalt focus:shadow-[0_0_0_3px_rgb(28_63_209/0.2)] focus:outline-none"
      />
    </form>
  );
}

function isActive(pathname: string, search: string, href: string) {
  const [path, query] = href.split("?");
  if (pathname !== path) return false;
  const category = new URLSearchParams(search).get("category");
  const target = query ? new URLSearchParams(query).get("category") : null;
  return category === target;
}

function HeaderInner() {
  const pathname = usePathname();
  const params = useSearchParams();
  const { session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const searchId = useId();
  const count = session?.cart_count ?? 0;
  const search = params.toString();

  // Close overlays on navigation.
  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [pathname, search]);

  // Mobile menu: Escape closes, focus moves in and is restored on close.
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("a,button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
      if (e.key === "Tab" && panel.current) {
        const focusables = panel.current.querySelectorAll<HTMLElement>("a,button,input");
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const accountHref = session?.user ? "/account" : "/signin";
  const accountLabel = session?.user ? `Your account (${session.user.name})` : "Sign in";

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-ivory/90 backdrop-blur supports-[backdrop-filter]:bg-ivory/80">
      <div className="container-page flex h-16 items-center gap-3 lg:h-[4.5rem]">
        <button
          ref={menuButton}
          type="button"
          className="icon-btn -ml-2 lg:hidden"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label="Open menu"
          onClick={() => setMenuOpen(true)}
        >
          <Menu className="size-5" aria-hidden />
        </button>

        <Logo />

        <nav aria-label="Main" className="ml-8 hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = isActive(pathname, search, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-full px-3.5 py-2 text-[0.9375rem] font-medium transition-colors hover:bg-sand ${active ? "text-cobalt" : "text-ink-soft hover:text-ink"}`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto hidden w-full max-w-xs md:block">
          <SearchForm id={searchId} />
        </div>

        <div className="ml-auto flex items-center gap-0.5 md:ml-2">
          <button
            type="button"
            className="icon-btn md:hidden"
            aria-label={searchOpen ? "Close search" : "Search products"}
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((v) => !v)}
          >
            {searchOpen ? <X className="size-5" aria-hidden /> : <Search className="size-5" aria-hidden />}
          </button>
          <Link href={accountHref} className="icon-btn" aria-label={accountLabel} title={accountLabel}>
            {session?.user?.picture ? (
              <img src={session.user.picture} alt="" width={28} height={28} className="size-7 rounded-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <User className="size-5" aria-hidden />
            )}
          </Link>
          <Link
            href="/cart"
            className="relative inline-flex h-11 items-center gap-2 rounded-full pl-3 pr-3.5 font-semibold text-ink transition-colors hover:bg-sand"
            aria-label={`Cart, ${count} ${count === 1 ? "item" : "items"}`}
          >
            <ShoppingBag className="size-5" aria-hidden />
            <span
              className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-xs leading-6 tabular-nums transition-colors ${count > 0 ? "bg-cobalt text-white" : "bg-sand text-ink-muted"}`}
              aria-hidden
            >
              {count}
            </span>
          </Link>
        </div>
      </div>

      {searchOpen && (
        <div className="container-page pb-3 md:hidden">
          <SearchForm id={`${searchId}-m`} autoFocus onDone={() => setSearchOpen(false)} />
        </div>
      )}

      {/* Mobile menu */}
      <div
        id={menuId}
        hidden={!menuOpen}
        className="fixed inset-0 z-50 lg:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
      >
        <div className="absolute inset-0 bg-ink/30" onClick={() => setMenuOpen(false)} aria-hidden />
        <div ref={panel} className="animate-rise absolute inset-y-0 left-0 flex w-[min(22rem,88vw)] flex-col bg-ivory shadow-[var(--shadow-lift)]">
          <div className="flex h-16 items-center justify-between border-b border-line px-4">
            <Logo />
            <button
              type="button"
              className="icon-btn"
              aria-label="Close menu"
              onClick={() => {
                setMenuOpen(false);
                menuButton.current?.focus();
              }}
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-2 py-4">
            <ul className="space-y-1">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(pathname, search, item.href) ? "page" : undefined}
                    className="block rounded-xl px-3 py-3 font-display text-2xl text-ink hover:bg-sand aria-[current=page]:text-cobalt"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <ul className="mt-6 space-y-1 border-t border-line pt-4">
              <li>
                <Link href="/cart" className="block rounded-xl px-3 py-3 font-medium hover:bg-sand">
                  Cart ({count})
                </Link>
              </li>
              <li>
                <Link href={accountHref} className="block rounded-xl px-3 py-3 font-medium hover:bg-sand">
                  {session?.user ? "Your account" : "Sign in"}
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </header>
  );
}

export function Header() {
  return (
    <Suspense fallback={<div className="h-16 border-b border-line lg:h-[4.5rem]" />}>
      <HeaderInner />
    </Suspense>
  );
}
