from decimal import Decimal

from django.test import TestCase, override_settings

from cart.models import Cart, CartItem
from catalog.models import Product

from .helpers import csrf_client, make_product, make_user


class CartTests(TestCase):
    def setUp(self):
        self.client = csrf_client()
        self.lamp = make_product("Lamp", "40.00", stock=5)
        self.mug = make_product("Mug", "10.00", stock=50)

    def add(self, product, qty=1, client=None):
        return (client or self.client).post("/api/cart/items/", {"product_id": product.pk, "quantity": qty}, format="json")

    def test_guest_cart_persists_in_database_across_requests(self):
        self.assertEqual(self.add(self.lamp, 2).status_code, 201)
        self.assertEqual(Cart.objects.count(), 1)
        cart = self.client.get("/api/cart/").json()
        self.assertEqual(cart["item_count"], 2)
        self.assertEqual(cart["subtotal"], "80.00")

    def test_adding_same_product_increments(self):
        self.add(self.mug, 2)
        self.add(self.mug, 3)
        self.assertEqual(CartItem.objects.get().quantity, 5)

    def test_rejects_invalid_quantities(self):
        for bad in [0, -1, "abc", 1.5, None, 99]:
            r = self.add(self.mug, bad)
            self.assertIn(r.status_code, (400, 409), bad)
            self.assertIn(r.json()["error"]["code"], ("invalid_quantity",), bad)
        self.assertFalse(CartItem.objects.exists())

    def test_rejects_quantity_beyond_stock(self):
        r = self.add(self.lamp, 6)
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["error"]["code"], "insufficient_stock")
        self.assertEqual(r.json()["error"]["available"], 5)
        self.add(self.lamp, 4)
        r = self.add(self.lamp, 2)
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["error"]["available"], 1)

    def test_rejects_out_of_stock_and_inactive(self):
        sold_out = make_product("Gone", stock=0)
        hidden = make_product("Hidden", active=False)
        self.assertEqual(self.add(sold_out).json()["error"]["code"], "out_of_stock")
        self.assertEqual(self.add(hidden).status_code, 404)

    def test_update_and_remove(self):
        self.add(self.mug, 1)
        item_id = CartItem.objects.get().pk
        r = self.client.patch(f"/api/cart/items/{item_id}/", {"quantity": 4}, format="json")
        self.assertEqual(r.json()["item_count"], 4)
        r = self.client.patch(f"/api/cart/items/{item_id}/", {"quantity": 0}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client.delete(f"/api/cart/items/{item_id}/")
        self.assertEqual(r.json()["item_count"], 0)

    def test_cannot_touch_someone_elses_cart_item(self):
        other = csrf_client()
        self.add(self.mug, 1, client=other)
        foreign_id = CartItem.objects.get().pk
        self.assertEqual(self.client.patch(f"/api/cart/items/{foreign_id}/", {"quantity": 2}, format="json").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/cart/items/{foreign_id}/").status_code, 404)
        self.assertEqual(CartItem.objects.get().quantity, 1)

    def test_csrf_is_required_for_guest_writes(self):
        from rest_framework.test import APIClient

        naked = APIClient(enforce_csrf_checks=True)
        naked.get("/api/session/")
        r = naked.post("/api/cart/items/", {"product_id": self.mug.pk, "quantity": 1}, format="json")
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.json()["error"]["code"], "csrf_failed")

    def test_reconcile_flags_price_and_stock_changes(self):
        self.add(self.lamp, 4)
        Product.objects.filter(pk=self.lamp.pk).update(price=Decimal("45.00"), stock=2)
        cart = self.client.get("/api/cart/").json()
        types = sorted(n["type"] for n in cart["notices"])
        self.assertEqual(types, ["price_changed", "quantity_reduced"])
        self.assertEqual(cart["items"][0]["quantity"], 2)
        self.assertEqual(cart["subtotal"], "90.00")
        # Notices are shown once, then the cart is consistent.
        self.assertEqual(self.client.get("/api/cart/").json()["notices"], [])

    def test_sold_out_items_are_removed_with_notice(self):
        self.add(self.lamp, 1)
        Product.objects.filter(pk=self.lamp.pk).update(stock=0)
        cart = self.client.get("/api/cart/").json()
        self.assertEqual(cart["items"], [])
        self.assertEqual(cart["notices"][0]["type"], "removed")


class CartMergeTests(TestCase):
    def setUp(self):
        self.user = make_user()
        self.lamp = make_product("Lamp", "40.00", stock=5)
        self.mug = make_product("Mug", "10.00", stock=50)
        self.book = make_product("Book", "20.00", stock=50)

    def test_guest_cart_merges_into_user_cart_on_login(self):
        # Existing saved cart for the user: 2 mugs, 1 book.
        user_cart = Cart.objects.create(user=self.user)
        CartItem.objects.create(cart=user_cart, product=self.mug, quantity=2, unit_price_seen=self.mug.price)
        CartItem.objects.create(cart=user_cart, product=self.book, quantity=1, unit_price_seen=self.book.price)

        guest = csrf_client()
        guest.post("/api/cart/items/", {"product_id": self.mug.pk, "quantity": 3}, format="json")
        guest.post("/api/cart/items/", {"product_id": self.lamp.pk, "quantity": 1}, format="json")
        guest_cart = Cart.objects.get(user__isnull=True)

        guest.force_login(self.user)  # fires user_logged_in like allauth does

        self.assertFalse(Cart.objects.filter(pk=guest_cart.pk).exists())
        quantities = {i.product.name: i.quantity for i in Cart.objects.get(user=self.user).items.all()}
        # Overlapping product takes the larger quantity (not 2 + 3).
        self.assertEqual(quantities, {"Mug": 3, "Book": 1, "Lamp": 1})
        self.assertEqual(guest.get("/api/cart/").json()["item_count"], 5)

    def test_guest_cart_becomes_user_cart_when_user_has_none(self):
        guest = csrf_client()
        guest.post("/api/cart/items/", {"product_id": self.mug.pk, "quantity": 2}, format="json")
        guest.force_login(self.user)
        self.assertEqual(Cart.objects.get().user, self.user)

    def test_merge_respects_stock(self):
        user_cart = Cart.objects.create(user=self.user)
        CartItem.objects.create(cart=user_cart, product=self.lamp, quantity=1, unit_price_seen=self.lamp.price)
        guest = csrf_client()
        guest.post("/api/cart/items/", {"product_id": self.lamp.pk, "quantity": 5}, format="json")
        Product.objects.filter(pk=self.lamp.pk).update(stock=3)
        guest.force_login(self.user)
        self.assertEqual(Cart.objects.get(user=self.user).items.get().quantity, 3)

    def test_logout_starts_a_fresh_guest_cart_and_keeps_user_cart(self):
        client = csrf_client()
        client.force_login(self.user)
        client.post("/api/cart/items/", {"product_id": self.mug.pk, "quantity": 2}, format="json")
        client.logout()
        fresh = csrf_client()
        self.assertEqual(fresh.get("/api/cart/").json()["item_count"], 0)
        self.assertEqual(Cart.objects.get(user=self.user).items.get().quantity, 2)
