from django.core.management import call_command
from django.test import TestCase

from catalog.models import Category, Product


class SeedTests(TestCase):
    def test_seed_is_repeatable(self):
        call_command("seed_catalog", verbosity=0)
        call_command("seed_catalog", verbosity=0)
        self.assertEqual(Category.objects.count(), 3)
        active = Product.objects.filter(is_active=True)
        self.assertGreaterEqual(active.count(), 12)
        for slug in ("tech", "home", "lifestyle"):
            self.assertTrue(active.filter(category__slug=slug).exists())
        self.assertTrue(all(p.images.count() == 3 for p in active))

    def test_reseed_keeps_stock_unless_reset(self):
        call_command("seed_catalog", verbosity=0)
        p = Product.objects.get(sku="CZ-TEC-001")
        Product.objects.filter(pk=p.pk).update(stock=1)
        call_command("seed_catalog", verbosity=0)
        self.assertEqual(Product.objects.get(pk=p.pk).stock, 1)
        call_command("seed_catalog", "--reset-stock", verbosity=0)
        self.assertEqual(Product.objects.get(pk=p.pk).stock, 24)
