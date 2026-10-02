# Requirement checklist

✅ done and tested · 🟡 done, needs your credentials to verify end to end

## Project & stack
| Requirement | Status | Where |
|---|---|---|
| Django + DRF backend | ✅ | `backend/` |
| Next.js + TypeScript + Tailwind frontend | ✅ | `frontend/` |
| PostgreSQL (Neon/Supabase) with Django migrations as source of truth | ✅ local PG16 / 🟡 Neon | `*/migrations`, `DATABASE_URL` |
| Secrets in env, complete `.env.example` | ✅ | `.env.example`, `frontend/.env.example` |

## Pages & UX
| Requirement | Status | Notes |
|---|---|---|
| Responsive nav: logo, shop links, search, account, cart count | ✅ | Mobile menu is a focus-trapped dialog that closes on Esc |
| Hero with value proposition and "Shop the collection" | ✅ | |
| Featured categories, featured products, brand story, footer with contact | ✅ | No invented reviews, certifications or claims |
| Catalog: search (name + description), category, price, sort (price/newest), pagination | ✅ | Tested in `test_catalog.py` and E2E |
| Filters reflected in URL; back/forward works | ✅ | E2E checks the back button |
| Loading, empty and error states | ✅ | Skeletons, "No products match", error cards and `error.tsx` |
| Product page: gallery, price, description, category, availability, quantity limited to stock, add to cart, details, related, feedback | ✅ | Toast, inline confirmation and screen-reader announcement |
| Cart: update, remove, thumbnails and links, subtotals, summary, checkout, empty state, stock/price change notices | ✅ | |
| DB-persisted guest carts via session; merge on login without unexpected duplication | ✅ | `test_cart.py::CartMergeTests` |
| Checkout: contact, shipping, billing-if-different, shipping method, review, itemized totals, validation, duplicate-submit protection | ✅ | Client + server validation; idempotency key; button disabled while submitting |
| Guest checkout; Google sign-in offered without blocking | ✅ | "Sign in with Google" link in the Contact step |
| Honest demo payment, no card fields, payment seam | ✅ | `orders/payments.py` |
| Configurable currency, shipping and tax | ✅ | Env vars; tax clearly labelled as a demo rate |
| Confirmation: reference, items, total, shipping, email status | ✅ | |
| Cart cleared only after the order commits | ✅ | Same transaction; tested |
| Safe guest confirmation access | ✅ | Session or hashed link token; 404 otherwise |
| Account: profile, order history, order detail, ownership checks | ✅ | `test_orders_access.py` |

## Backend
| Requirement | Status |
|---|---|
| Users, Google associations, categories, products, images, carts, addresses, orders, items, status history, email attempts | ✅ |
| Order item snapshots | ✅ tested |
| Constraints, indexes, timestamps | ✅ |
| Admin for products, inventory, orders and emails | ✅ |
| Repeatable seed with ≥12 products | ✅ 14 products (`seed_catalog`, tested) |
| Transactions, concurrency-safe stock, idempotent checkout | ✅ tested with real threads |
| Consistent API errors | ✅ |

## Google auth
| Requirement | Status |
|---|---|
| Maintained library (django-allauth 65), login, logout, session persistence, safe redirects | ✅ |
| Cancelled / provider errors handled | ✅ verified with a simulated cancel |
| Secure cookies, CSRF, no CORS needed | ✅ |
| Secret only on backend; tokens not stored; safe account linking | ✅ |
| Real Google round trip | 🟡 needs your OAuth client — steps in SETUP_SERVICES.md §2.6 |

## Mailgun
| Requirement | Status |
|---|---|
| Branded HTML + plain-text email: reference, items, totals, address, safe link, demo wording | ✅ |
| Server-side credentials; configurable domain, sender and region | ✅ |
| Durable outbox with retries; outage never undoes an order; no duplicate sends | ✅ tested with mocked Mailgun |
| Dev preview backend, clearly labelled | ✅ |
| Real delivery | 🟡 needs your API key and domain |

## Quality
| Requirement | Status |
|---|---|
| Semantic HTML, labels, autocomplete, field errors, focus styles, contrast, touch targets ≥44px | ✅ axe-core: 0 violations on the main pages |
| Live announcements for cart and form updates | ✅ |
| No horizontal overflow at 390px; images sized to avoid layout shift | ✅ E2E |
| Reduced-motion respected | ✅ |

---

## Limitations

1. **No real payments.** Orders are marked "Demo — not charged" and nothing ships. This is by design.
2. **Demo tax.** A flat configurable rate on merchandise. It is not jurisdiction-aware and not suitable for production.
3. **Single currency.** One store-wide currency. Prices aren't converted.
4. **Images are hot-linked from Unsplash.** They need internet access. If an image fails, a branded placeholder is shown instead. There's no image upload; admins paste image URLs.
5. **Email is at-least-once.** A crash between Mailgun accepting a message and the database recording it can, rarely, send a duplicate after the 10-minute reclaim window. The email link contains the order's access token, so the stored email body includes that token.
6. **Rate limiting uses per-process memory** (LocMemCache). With several servers, limits apply per process. Use Redis for shared limits.
7. **Guest orders aren't attached** to an account created later with the same email. This is deliberate, so nobody can claim someone else's orders.
8. **No stock reservation in the cart.** Stock is guaranteed only at checkout. If an item sells out first, the shopper sees a clear message.
9. **Product variants** (size and colour) aren't implemented, as the brief allows.
10. **`/shop` has no route-level skeleton.** While new results load, the toolbar shows "Updating…" and the current results fade. A `loading.tsx` on that route made Next.js 15.5 occasionally drop navigations where only the search parameters changed, so it was removed. Product pages keep their skeleton.
