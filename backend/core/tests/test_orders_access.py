from django.test import TestCase, override_settings

from orders.models import Order

from .helpers import checkout_payload, csrf_client, make_product, make_user, new_key


@override_settings(MAIL_SEND_ON_COMMIT=False)
class OrderAccessTests(TestCase):
    def setUp(self):
        self.product = make_product("Lamp", "20.00", stock=50)
        self.alice = make_user("alice@example.com")
        self.bob = make_user("bob@example.com")

    def place(self, client):
        client.post("/api/cart/items/", {"product_id": self.product.pk, "quantity": 1}, format="json")
        r = client.post("/api/checkout/", checkout_payload(), format="json", HTTP_IDEMPOTENCY_KEY=new_key())
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def test_user_sees_only_their_orders(self):
        alice = csrf_client()
        alice.force_login(self.alice)
        ref = self.place(alice)["order"]["reference"]

        bob = csrf_client()
        bob.force_login(self.bob)
        self.assertEqual(bob.get("/api/account/orders/").json()["count"], 0)
        self.assertEqual(bob.get(f"/api/account/orders/{ref}/").status_code, 404)
        self.assertEqual(bob.get(f"/api/orders/{ref}/").status_code, 404)

        self.assertEqual(alice.get("/api/account/orders/").json()["results"][0]["reference"], ref)
        self.assertEqual(alice.get(f"/api/account/orders/{ref}/").status_code, 200)

    def test_account_endpoints_require_sign_in(self):
        anon = csrf_client()
        for url in ["/api/account/", "/api/account/orders/", "/api/account/orders/CZ-AAAAAAAA/"]:
            r = anon.get(url)
            self.assertEqual(r.status_code, 403, url)
            self.assertEqual(r.json()["error"]["code"], "not_authenticated")

    def test_guest_can_view_own_confirmation_in_same_session(self):
        guest = csrf_client()
        ref = self.place(guest)["order"]["reference"]
        self.assertEqual(guest.get(f"/api/orders/{ref}/").status_code, 200)

    def test_guest_order_needs_token_from_another_browser(self):
        guest = csrf_client()
        data = self.place(guest)
        ref, token = data["order"]["reference"], data["access_token"]
        self.assertTrue(token)
        stranger = csrf_client()
        self.assertEqual(stranger.get(f"/api/orders/{ref}/").status_code, 404)
        self.assertEqual(stranger.get(f"/api/orders/{ref}/?token=wrong").status_code, 404)
        self.assertEqual(stranger.get(f"/api/orders/{ref}/?token={token}").status_code, 200)

    def test_token_is_stored_hashed(self):
        guest = csrf_client()
        data = self.place(guest)
        order = Order.objects.get()
        self.assertNotEqual(order.access_token_hash, data["access_token"])
        self.assertEqual(len(order.access_token_hash), 64)

    def test_signed_in_user_cannot_see_guest_orders_by_reference(self):
        guest = csrf_client()
        ref = self.place(guest)["order"]["reference"]
        bob = csrf_client()
        bob.force_login(self.bob)
        self.assertEqual(bob.get(f"/api/orders/{ref}/").status_code, 404)

    def test_logout_endpoint(self):
        c = csrf_client()
        c.force_login(self.alice)
        self.assertEqual(c.get("/api/session/").json()["user"]["email"], "alice@example.com")
        c.post("/api/auth/logout/")
        self.assertIsNone(c.get("/api/session/").json()["user"])


class ThrottleTests(TestCase):
    @override_settings(CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "throttle-test"}})
    def test_checkout_is_rate_limited(self):
        client = csrf_client()
        codes = [
            client.post("/api/checkout/", checkout_payload(), format="json", HTTP_IDEMPOTENCY_KEY=new_key()).status_code
            for _ in range(12)
        ]
        self.assertIn(429, codes)
        r = client.post("/api/checkout/", checkout_payload(), format="json", HTTP_IDEMPOTENCY_KEY=new_key())
        self.assertEqual(r.json()["error"]["code"], "rate_limited")
