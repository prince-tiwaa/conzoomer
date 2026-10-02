from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from catalog.models import Category, Product

from .helpers import make_product


class CatalogApiTests(TestCase):
    def setUp(self):
        self.tech = Category.objects.create(name="Tech", slug="tech")
        self.home = Category.objects.create(name="Home", slug="home")
        self.headphones = make_product("Halo Headphones", "189.00", category=self.tech, description="wireless audio")
        self.lamp = make_product("Arc Lamp", "118.00", category=self.home, description="warm reading light")
        self.mug = make_product("Stone Mug", "12.50", category=self.home, description="ceramic mug for coffee")
        self.hidden = make_product("Secret Prototype", "50.00", category=self.tech, active=False)
        now = timezone.now()
        for i, p in enumerate([self.headphones, self.lamp, self.mug]):
            Product.objects.filter(pk=p.pk).update(created_at=now - timedelta(days=i))

    def names(self, response):
        self.assertEqual(response.status_code, 200, response.content)
        return [p["name"] for p in response.json()["results"]]

    def test_search_matches_name_and_description(self):
        self.assertEqual(self.names(self.client.get("/api/products/?q=lamp")), ["Arc Lamp"])
        self.assertEqual(self.names(self.client.get("/api/products/?q=coffee")), ["Stone Mug"])

    def test_inactive_products_are_hidden(self):
        self.assertNotIn("Secret Prototype", self.names(self.client.get("/api/products/?q=secret")))
        self.assertEqual(self.client.get(f"/api/products/{self.hidden.slug}/").status_code, 404)

    def test_category_and_price_filters(self):
        self.assertEqual(sorted(self.names(self.client.get("/api/products/?category=home"))), ["Arc Lamp", "Stone Mug"])
        self.assertEqual(self.names(self.client.get("/api/products/?min_price=100&max_price=150")), ["Arc Lamp"])

    def test_invalid_filters_return_consistent_errors(self):
        r = self.client.get("/api/products/?min_price=abc")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["error"]["code"], "invalid_filter")
        r = self.client.get("/api/products/?min_price=200&max_price=10")
        self.assertEqual(r.json()["error"]["code"], "invalid_filter")
        self.assertEqual(self.client.get("/api/products/?category=nope").status_code, 404)

    def test_sorting(self):
        self.assertEqual(self.names(self.client.get("/api/products/?sort=price_asc")), ["Stone Mug", "Arc Lamp", "Halo Headphones"])
        self.assertEqual(self.names(self.client.get("/api/products/?sort=price_desc")), ["Halo Headphones", "Arc Lamp", "Stone Mug"])
        self.assertEqual(self.names(self.client.get("/api/products/?sort=newest")), ["Halo Headphones", "Arc Lamp", "Stone Mug"])

    def test_pagination(self):
        r = self.client.get("/api/products/?page_size=2&page=2&sort=price_asc").json()
        self.assertEqual(r["count"], 3)
        self.assertEqual(r["num_pages"], 2)
        self.assertEqual([p["name"] for p in r["results"]], ["Halo Headphones"])

    def test_detail_includes_related_and_stock_limits(self):
        r = self.client.get(f"/api/products/{self.lamp.slug}/").json()
        self.assertEqual(r["product"]["max_quantity"], 10)
        self.assertIn("Stone Mug", [p["name"] for p in r["related"]])
        self.assertNotIn("Arc Lamp", [p["name"] for p in r["related"]])

    def test_prices_are_decimal_strings(self):
        r = self.client.get(f"/api/products/{self.mug.slug}/").json()
        self.assertEqual(r["product"]["price"], "12.50")
