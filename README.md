# Conzoomer

Conzoomer is a small, carefully chosen online shop for everyday Tech, Home and Lifestyle products. It has a complete demo checkout, a PostgreSQL database, Google sign-in and Mailgun order-confirmation emails.

- **Backend:** Django 5.2 LTS, Django REST Framework, django-allauth (Google), PostgreSQL (Neon or Supabase), Mailgun HTTP API
- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind CSS 4
- **Mobile app:** Expo (React Native) app in [`mobile/`](mobile/README.md). It shares accounts and the cart with the website.
- **Payment:** checkout creates real orders but never collects card details and never charges anyone.

> Other docs: [Mobile app](mobile/README.md) · [Mobile submission & video script](docs/MOBILE_DEMO.md) · [Architecture](docs/ARCHITECTURE.md) · [Service setup: Google, Neon, Mailgun](docs/SETUP_SERVICES.md) · [Deployment](docs/DEPLOYMENT.md) · [Requirements checklist](docs/CHECKLIST.md) · [Demo script](docs/DEMO_SCRIPT.md)

---

## 1. Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.11 – 3.13 |
| Node.js | 20.9 or newer (22 LTS recommended) |
| PostgreSQL | A Neon (or Supabase) database. A local Postgres 14+ also works. |

## 2. Run it locally

Commands are shown for **Windows PowerShell**. macOS/Linux equivalents are in comments.

### 2.1 Backend (Django API, port 8000)

```powershell
cd backend
py -3.12 -m venv .venv                 # macOS/Linux: python3 -m venv .venv
.\.venv\Scripts\Activate.ps1           # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

# Only if backend\.env does not exist yet (this overwrites it):
copy ..\.env.example .env              # macOS/Linux: cp ../.env.example .env
# Edit backend\.env. At minimum set DATABASE_URL (see docs/SETUP_SERVICES.md → Neon).
# For a local demo before Google is configured, also set DJANGO_DEBUG=true and DEV_LOGIN_ENABLED=true.

python manage.py migrate
python manage.py seed_catalog          # 14 products across 3 categories; safe to re-run
python manage.py createsuperuser       # for /admin
python manage.py runserver 8000
```

> If PowerShell blocks `Activate.ps1`, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or use `.\.venv\Scripts\activate.bat` from cmd.

### 2.2 Frontend (Next.js storefront, port 3000)

In a second terminal:

```powershell
cd frontend
npm install
copy .env.example .env.local           # macOS/Linux: cp .env.example .env.local
npm run dev
```

Open **http://localhost:3000**. Always use this address, not `:8000`. The storefront forwards `/api`, `/accounts`, `/admin` and `/static` to Django, so cookies, CSRF and the Google callback all live on one origin.

- Admin: http://localhost:3000/admin (manage products, stock, orders and emails)
- Health check: http://localhost:3000/api/health

### 2.3 Email worker (retries)

After each order is committed, Conzoomer tries to send its confirmation email straight away. Anything that failed (for example, a Mailgun outage) stays in the outbox and is retried by:

```powershell
python manage.py send_pending_emails            # one pass
python manage.py send_pending_emails --loop     # keep running, checking every 30s
```

While `MAIL_BACKEND=preview` is set, nothing is sent. The rendered HTML and text are saved to `backend/var/email-previews/`, and the confirmation page links to an **email preview**. The page says plainly that this is a preview, not a delivery.

### 2.4 Useful commands

```powershell
# Backend tests (needs DATABASE_URL; Django creates and destroys a test database)
python manage.py test core

# Restore seeded stock levels after demo purchases
python manage.py seed_catalog --reset-stock

# Frontend checks
npm run typecheck
npm run lint
npm run build && npm start             # production build on port 3000
```

> **Neon and tests:** Django needs permission to create a `test_…` database. Neon's default role can do this. If yours can't, point `DATABASE_URL` at a local Postgres while you run the tests.

## 3. Environment variables

Every variable is listed and explained in [`.env.example`](.env.example) for the backend and [`frontend/.env.example`](frontend/.env.example) for the frontend. Secrets (the database URL, Google client secret and Mailgun key) are only ever read by Django and never reach the browser bundle.

## 4. Project layout

```
backend/
  config/            settings, urls
  core/              auth (CSRF-enforcing session auth), error envelope, session/logout views, tests
  catalog/           Category, Product, ProductImage + seed_catalog command
  cart/              Cart, CartItem, guest→user merge on login
  orders/            Address, Order, OrderItem, OrderStatusEvent, pricing, checkout service, payment seam
  notifications/     EmailMessage outbox, EmailDeliveryAttempt, Mailgun/preview backends, worker command
  templates/         order email (HTML + text), error pages, allauth layout
frontend/
  src/app/           pages: home, shop, products/[slug], cart, checkout, orders/[reference], account, signin
  src/components/    header, product card/gallery, filters, quantity stepper, order view, toasts
  src/lib/           API client (CSRF + errors), server fetchers, formatting, types
docs/                setup, deployment, architecture, checklist, demo script
```

## 5. What is (and isn't) verified

**Tested in the build environment.** These ran against a real PostgreSQL 16:

- **Backend tests:** 55 pass. They cover catalog search, filters, sorting and pagination; cart persistence, merging and CSRF; server-side Decimal totals; invalid quantities and insufficient stock; concurrent checkouts with real threads and row locks; duplicate submissions; order-item snapshots; user and guest order isolation; rate limiting; Mailgun success, outage, retry, give-up and no-duplicate behaviour (Mailgun HTTP mocked); and seeding.
- **Frontend checks:** `tsc`, ESLint and `next build` are clean.
- **End-to-end:** a Playwright run at 390 px (mobile) and 1440 px (desktop) went browse → filter → sort → back button → search empty state → pagination → product → add to cart → cart → checkout validation → demo order (double-clicked; exactly one order was created) → confirmation → sign in → account. It found no horizontal overflow and no console errors. axe-core reported no WCAG A/AA violations on the main pages.
- **OAuth wiring:** checked with placeholder credentials. Allauth builds the correct Google URL (PKCE, `redirect_uri=http://localhost:3000/accounts/google/login/callback/`), and a cancelled sign-in sends you back to `/signin?error=cancelled`.

**Not yet verified (needs your credentials):**

- **Google sign-in:** a real round trip with Google needs a real client ID and secret. Follow docs/SETUP_SERVICES.md, then test it yourself.
- **Mailgun:** real delivery needs an API key and domain. The request format follows Mailgun's v3 `messages` API and is unit-tested against a mock.
- **Neon:** the build environment used local PostgreSQL 16. Neon is standard PostgreSQL, so nothing should change, but run `migrate` and the test suite against your Neon URL to confirm.
- **Product photos:** these are hot-linked from Unsplash. Every image URL was checked and loads. If an image ever fails, the store shows a branded placeholder tile instead.

## 6. Known limitations

See [docs/CHECKLIST.md → Limitations](docs/CHECKLIST.md#limitations).
