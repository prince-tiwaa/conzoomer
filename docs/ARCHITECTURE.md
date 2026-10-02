# Architecture

```
┌──────────── Browser ────────────┐
│ Next.js pages (React)           │
│  - server-rendered: home, shop, │
│    product pages                │
│  - client: cart, checkout,      │
│    account, confirmation        │
└───────────────┬─────────────────┘
                │ same origin (cookies: cz_session, csrftoken)
┌───────────────▼─────────────────┐       ┌──────────────────────┐
│ Next.js server                  │──────►│ Django + DRF         │
│  rewrites /api /accounts /admin │       │  catalog · cart ·    │
│  /static → Django               │       │  orders · notif. ·   │
│  server components fetch the    │       │  allauth (Google)    │
│  catalog straight from Django   │       └─────┬─────────┬──────┘
└─────────────────────────────────┘             │         │ HTTPS
                                       PostgreSQL│         ▼
                                       (Neon)    │     Mailgun API
                                                 ▼
                                    users, carts, orders, email outbox
```

## Key decisions

**One origin, two apps.** Next.js proxies the Django paths, so the browser only ever talks to one host. Session and CSRF cookies are first-party and `SameSite=Lax`, so no CORS setup is needed and third-party cookie blocking can't break checkout. Google redirects back to the storefront host. Django sees the original host via `X-Forwarded-Host` and builds matching URLs.

**Django is the source of truth.** Models and migrations define the schema. The browser never sends prices: totals are computed in `orders/pricing.py` with `Decimal` and `ROUND_HALF_UP` to cents. Checkout can also accept the total the shopper saw (`expected_total`). If the server's total differs, it refuses with `409 totals_changed` and returns the new numbers instead of placing an unexpected order.

**Carts.** A `Cart` belongs either to a user (at most one, enforced by a partial unique constraint) or to a guest. A guest cart is referenced by a random UUID kept in the server-side Django session, inside an HttpOnly cookie. On login, a `user_logged_in` signal merges the guest cart into the user's cart. When both carts hold the same product, the **larger** quantity wins, capped at stock — quantities are never added together. Each time the cart is read, it's reconciled against current stock and prices, and the shopper sees a notice for anything that changed.

**Placing an order** (`orders/services.py: place_order`) runs in one transaction:
1. `SELECT … FOR UPDATE` on the cart row serializes double clicks and duplicate tabs.
2. The idempotency key is checked again inside the lock. A replay with the same key returns the original order (`200`, `replayed: true`). A key reused by a different visitor gets `409`.
3. `SELECT … FOR UPDATE` on the products, ordered by id so concurrent checkouts can't deadlock, then stock is re-checked.
4. Totals are priced from the locked rows; address rows, the order and item snapshots (name, SKU, unit price, quantity, line total) are created.
5. Stock is decremented with `F()` expressions. A database `CHECK (stock >= 0)` is the last line of defence.
6. The confirmation email is written to the outbox and the cart is emptied.

If any step fails, nothing is saved — not the order, the stock change, the email or the emptied cart. A unique index on `idempotency_key` handles the final race between two identical requests.

**Payment seam.** `orders/payments.py` defines a `PaymentProvider` interface. `DemoPaymentProvider` always returns `demo_not_charged`. A real provider would create a payment intent, store its reference, and set `paid` only from a verified webhook.

**Guest order access.** Every order has a 256-bit random access token, and only its SHA-256 hash is stored. The token appears in the confirmation email link. The browser session that placed an order can also view it. A signed-in user can see only orders where `order.user` is them, because ownership is part of the database query. Every other case gets an identical `404`, so order references can't be enumerated.

**Email outbox.** See *SETUP_SERVICES.md → How delivery works*.

**Security.**
- DRF uses a session authentication class that enforces CSRF for **guests as well as** signed-in users.
- Throttles: checkout 10/min; cart, auth and order lookup are also rate-limited.
- Redirects after login only accept same-site relative paths.
- Google tokens aren't stored, and accounts are never auto-linked by email.
- Production settings switch on HTTPS redirect, secure cookies, HSTS, nosniff and frame denial.
- Logs never include secrets or card data (none is collected). Mailgun errors are trimmed before storage.

**Errors.** Every API error has the same shape: `{"error": {"code", "message", "fields?", ...}}`. The frontend maps codes to user-facing messages and field-level errors.

## Data model (main tables)

| Table | Notes |
|---|---|
| `auth_user`, `socialaccount_socialaccount` | Users and their Google identities (allauth) |
| `catalog_category`, `catalog_product`, `catalog_productimage` | Product price is `numeric(10,2)` with `CHECK price > 0`; `CHECK stock >= 0`; indexes on (active, category / price / featured) |
| `cart_cart`, `cart_cartitem` | One cart per user (partial unique); unique (cart, product); `CHECK quantity >= 1` |
| `orders_address` | Immutable per-order address rows |
| `orders_order` | Reference, owner, status, payment status, totals, unique idempotency key, hashed access token |
| `orders_orderitem` | Snapshot of name, SKU, price, quantity and line total; product FK is `SET NULL` |
| `orders_orderstatusevent` | Status history; admin status changes are logged automatically |
| `notifications_emailmessage`, `notifications_emaildeliveryattempt` | Outbox with unique dedupe key, attempts, backoff and provider id |
