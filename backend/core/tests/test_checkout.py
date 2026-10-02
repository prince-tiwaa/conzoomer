import threading
from decimal import Decimal

from django.db import connection
from django.test import TestCase, TransactionTestCase, override_settings

from cart.models import Cart, CartItem
from catalog.models import Product
from notifications.models import EmailMessage
from orders.models import Order, OrderItem

from .helpers import checkout_payload, csrf_client, make_product, make_user, new_key


@override_settings(DEMO_TAX_RATE=Decimal("0.08"), FREE_SHIPPING_THRESHOLD=Decimal("75.00"), MAIL_SEND_ON_COMMIT=False)
class CheckoutTests(TestCase):
    def setUp(self):
        self.client = csrf_client()
        self.lamp = make_product("Lamp", "19.99", stock=5)
        self.mug = make_product("Mug", "7.35", stock=10)

    def add(self, product, qty, client=None):
        r = (client or self.client).post("/api/cart/items/", {"product_id": product.pk, "quantity": qty}, format="json")
        self.assertEqual(r.status_code, 201, r.content)

    def checkout(self, key=None, client=None, **overrides):
        return (client or self.client).post(
            "/api/checkout/", checkout_payload(**overrides), format="json", HTTP_IDEMPOTENCY_KEY=key or new_key()
        )

    def test_totals_are_calculated_on_the_server_with_decimals(self):
        self.add(self.lamp, 2)  # 39.98
        self.add(self.mug, 3)   # 22.05 -> subtotal 62.03
        r = self.checkout(subtotal="0.01", total="0.01", shipping_total="0")  # browser-supplied junk is ignored
        self.assertEqual(r.status_code, 201, r.content)
        totals = r.json()["order"]["totals"]
        self.assertEqual(totals["subtotal"], "62.03")
        self.assertEqual(totals["shipping_total"], "6.00")
        self.assertEqual(totals["tax_total"], "4.96")  # 62.03 * 0.08 = 4.9624 -> 4.96
        self.assertEqual(totals["total"], "72.99")
        order = Order.objects.get()
        self.assertEqual(order.total, Decimal("72.99"))

    def test_free_shipping_threshold_and_express(self):
        self.add(self.lamp, 4)  # 79.96
        r = self.checkout()
        self.assertEqual(r.json()["order"]["totals"]["shipping_total"], "0.00")
        self.add(self.mug, 1)
        r = self.checkout(shipping_method="express")
        self.assertEqual(r.json()["order"]["totals"]["shipping_total"], "15.00")

    def test_order_creation_snapshots_items_and_decrements_stock(self):
        self.add(self.lamp, 2)
        r = self.checkout()
        self.assertEqual(r.status_code, 201)
        order = Order.objects.get()
        item = OrderItem.objects.get()
        self.assertEqual((item.product_name, item.unit_price, item.quantity, item.line_total),
                         ("Lamp", Decimal("19.99"), 2, Decimal("39.98")))
        self.lamp.refresh_from_db()
        self.assertEqual(self.lamp.stock, 3)
        self.assertEqual(order.payment_status, "demo_not_charged")
        self.assertEqual(order.status, "placed")
        self.assertEqual(order.events.count(), 1)
        # Cart cleared only after commit.
        self.assertFalse(CartItem.objects.exists())

        # Catalog changes don't rewrite history.
        Product.objects.filter(pk=self.lamp.pk).update(name="Lamp v2", price=Decimal("99.00"))
        self.lamp.delete()
        item.refresh_from_db()
        self.assertEqual((item.product_name, item.unit_price, item.product), ("Lamp", Decimal("19.99"), None))

    def test_duplicate_submission_with_same_key_returns_same_order(self):
        self.add(self.lamp, 1)
        key = new_key()
        first = self.checkout(key=key)
        second = self.checkout(key=key)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.json()["replayed"])
        self.assertEqual(first.json()["order"]["reference"], second.json()["order"]["reference"])
        self.assertEqual(Order.objects.count(), 1)
        self.assertEqual(EmailMessage.objects.count(), 1)
        self.lamp.refresh_from_db()
        self.assertEqual(self.lamp.stock, 4)

    def test_key_reused_by_another_visitor_is_rejected(self):
        self.add(self.lamp, 1)
        key = new_key()
        self.checkout(key=key)
        other = csrf_client()
        self.add(self.mug, 1, client=other)
        r = self.checkout(key=key, client=other)
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["error"]["code"], "idempotency_conflict")
        self.assertNotIn("order", r.json())

    def test_missing_idempotency_key_is_rejected(self):
        self.add(self.lamp, 1)
        r = self.client.post("/api/checkout/", checkout_payload(), format="json")
        self.assertEqual(r.json()["error"]["code"], "idempotency_key_required")

    def test_empty_cart(self):
        r = self.checkout()
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["error"]["code"], "cart_empty")

    def test_insufficient_stock_at_checkout_creates_nothing(self):
        self.add(self.lamp, 3)
        Product.objects.filter(pk=self.lamp.pk).update(stock=2)
        r = self.checkout()
        self.assertEqual(r.status_code, 409)
        body = r.json()["error"]
        self.assertEqual(body["code"], "insufficient_stock")
        self.assertEqual(body["items"][0]["available"], 2)
        self.assertFalse(Order.objects.exists())
        self.assertEqual(CartItem.objects.get().quantity, 3)  # cart untouched
        self.lamp.refresh_from_db()
        self.assertEqual(self.lamp.stock, 2)

    def test_expected_total_mismatch_is_refused_with_fresh_totals(self):
        self.add(self.lamp, 1)
        r = self.checkout(expected_total="1.00")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["error"]["code"], "totals_changed")
        self.assertIn("total", r.json()["error"]["totals"])
        self.assertFalse(Order.objects.exists())

    def test_field_validation(self):
        self.add(self.lamp, 1)
        bad = checkout_payload(email="not-an-email", phone="call me")
        bad["shipping_address"]["postal_code"] = "ABC"
        bad["shipping_address"]["full_name"] = " "
        r = self.client.post("/api/checkout/", bad, format="json", HTTP_IDEMPOTENCY_KEY=new_key())
        self.assertEqual(r.status_code, 400)
        fields = r.json()["error"]["fields"]
        self.assertIn("email", fields)
        self.assertIn("phone", fields)
        self.assertIn("shipping_address", fields)
        r = self.checkout(shipping_method="teleport")
        self.assertEqual(r.json()["error"]["fields"], {"shipping_method": "Choose a shipping method."})
        r = self.checkout(billing_same_as_shipping=False)
        self.assertIn("billing_address", r.json()["error"]["fields"])

    def test_separate_billing_address(self):
        self.add(self.lamp, 1)
        billing = {"full_name": "Bill Payer", "line1": "1 Bank St", "city": "London", "postal_code": "EC2R 8AH", "country": "GB"}
        r = self.checkout(billing_same_as_shipping=False, billing_address=billing)
        self.assertEqual(r.status_code, 201, r.content)
        order = Order.objects.get()
        self.assertNotEqual(order.shipping_address_id, order.billing_address_id)
        self.assertEqual(order.billing_address.country, "GB")

    def test_signed_in_checkout_links_order_to_user(self):
        user = make_user()
        self.client.force_login(user)
        self.add(self.lamp, 1)
        self.checkout()
        self.assertEqual(Order.objects.get().user, user)

    def test_quote_endpoint_uses_server_prices(self):
        self.add(self.mug, 2)
        r = self.client.post("/api/checkout/quote/", {"shipping_method": "express"}, format="json").json()
        self.assertEqual(r["totals"]["subtotal"], "14.70")
        self.assertEqual(r["totals"]["shipping_total"], "15.00")
        self.assertEqual(r["totals"]["total"], "30.88")  # 14.70 + 15 + 1.18


@override_settings(MAIL_SEND_ON_COMMIT=False)
class ConcurrentCheckoutTests(TransactionTestCase):
    """Real threads and real PostgreSQL row locks."""

    def _run_parallel(self, funcs):
        results = [None] * len(funcs)
        barrier = threading.Barrier(len(funcs))

        def runner(i, fn):
            try:
                barrier.wait()
                results[i] = fn()
            finally:
                connection.close()

        threads = [threading.Thread(target=runner, args=(i, fn)) for i, fn in enumerate(funcs)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        return results

    def test_two_shoppers_cannot_oversell_the_last_unit(self):
        product = make_product("Last One", "50.00", stock=1)
        clients = [csrf_client(), csrf_client(), csrf_client()]
        for c in clients:
            self.assertEqual(c.post("/api/cart/items/", {"product_id": product.pk, "quantity": 1}, format="json").status_code, 201)

        def buy(c):
            return lambda: c.post("/api/checkout/", checkout_payload(), format="json", HTTP_IDEMPOTENCY_KEY=new_key()).status_code

        statuses = self._run_parallel([buy(c) for c in clients])
        self.assertEqual(sorted(statuses), [201, 409, 409])
        product.refresh_from_db()
        self.assertEqual(product.stock, 0)
        self.assertEqual(Order.objects.count(), 1)

    def test_parallel_duplicate_submissions_create_one_order(self):
        product = make_product("Popular", "20.00", stock=10)
        client = csrf_client()
        client.post("/api/cart/items/", {"product_id": product.pk, "quantity": 2}, format="json")
        key = new_key()

        def submit():
            return client.post("/api/checkout/", checkout_payload(), format="json", HTTP_IDEMPOTENCY_KEY=key).status_code

        statuses = self._run_parallel([submit, submit, submit])
        self.assertEqual(sorted(statuses), [200, 200, 201])
        self.assertEqual(Order.objects.count(), 1)
        product.refresh_from_db()
        self.assertEqual(product.stock, 8)
        self.assertEqual(EmailMessage.objects.count(), 1)
