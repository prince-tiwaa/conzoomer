import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from catalog.models import Category, Product, ProductImage


def make_product(name="Test Lamp", price="25.00", stock=10, category=None, active=True, featured=False, **extra):
    category = category or Category.objects.get_or_create(slug="home", defaults={"name": "Home"})[0]
    slug = extra.pop("slug", None) or name.lower().replace(" ", "-") + "-" + uuid.uuid4().hex[:6]
    product = Product.objects.create(
        category=category,
        name=name,
        slug=slug,
        sku=uuid.uuid4().hex[:12],
        short_description=extra.pop("short_description", f"{name} short"),
        description=extra.pop("description", f"{name} description"),
        price=Decimal(price),
        stock=stock,
        is_active=active,
        is_featured=featured,
        **extra,
    )
    ProductImage.objects.create(product=product, url="https://example.com/x.jpg", alt=name)
    return product


def make_user(email="shopper@example.com", username=None):
    return get_user_model().objects.create_user(username=username or email, email=email, password=None)


def csrf_client():
    """APIClient that enforces CSRF like a real browser, with the token wired in."""
    client = APIClient(enforce_csrf_checks=True)
    client.get("/api/session/")
    token = client.cookies["csrftoken"].value
    client.credentials(HTTP_X_CSRFTOKEN=token)
    return client


ADDRESS = {
    "full_name": "Ada Lovelace",
    "line1": "12 Analytical Way",
    "city": "Austin",
    "region": "TX",
    "postal_code": "78701",
    "country": "US",
}


def checkout_payload(**overrides):
    data = {"email": "ada@example.com", "shipping_address": dict(ADDRESS), "shipping_method": "standard"}
    data.update(overrides)
    return data


def new_key():
    return uuid.uuid4().hex
