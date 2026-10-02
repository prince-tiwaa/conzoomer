# Demo script (about 7 minutes)

**Before you start:** run Django and Next.js, run `python manage.py seed_catalog --reset-stock`, and sign out. Keep `/admin` open in a second tab, and have your Neon dashboard (or `psql`) ready.

1. **Brand and home (45s).** Open `http://localhost:3000`. Point out the demo-store bar, the editorial hero, the categories, the featured products and the brand story. Resize to phone width to show the mobile layout, then open the menu (Esc closes it).
2. **Catalog (1 min).** Click **Shop the collection**. Filter **Home**, sort by **Price: high to low** and set a price range. Point out that the URL updates. Press **Back** to show history works. Search "zzz" to show the empty state, then **Clear all**. Show page 2.
3. **Product page (45s).** Open **Tempo Smartwatch**: gallery, "Only 3 left", and the quantity stepper stops at the stock limit. Add 2. Show the toast and the cart count updating. Then open **Snap Instant Camera** to show the disabled "Sold out" button.
4. **Cart (45s).** Change a quantity and remove an item. Point out the free-shipping progress bar and the estimated total. *Optional:* in the admin, change the product's price, reload the cart and show the "price changed" notice.
5. **Guest checkout (1.5 min).** Click **Place demo order** with empty fields to show the error summary, inline errors and focus on the first problem. Fill the form, switch to **Express** and watch the server-calculated total update. Point out the "No payment needed" notice. **Double-click** Place order.
6. **Confirmation (45s).** Show the reference, items, totals, address and email status. Click **Open the email preview** (or show the real inbox if Mailgun is configured). Then show the order in the **admin**, and in Neon (`orders_order`, `orders_orderitem`): there's exactly one order despite the double click, and the stock went down.
7. **Google sign-in (1 min).** Add an item as a guest, then **Sign in → Continue with Google** with a test user. You land on **Account**, the cart was merged, and order history works. Sign out, then cancel a sign-in to show the friendly error.
8. **Engineering highlights (1 min).** Run `python manage.py test core` (55 tests) and mention:
   - Row locks and idempotency keys, tested with real concurrent threads
   - Decimal totals computed on the server
   - The email outbox: a Mailgun outage can't undo an order
   - Order access checks (others get a 404, not a 403)
   - CSRF on guest writes
