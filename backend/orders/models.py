import hashlib
import secrets

from django.conf import settings
from django.db import models
from django.db.models import Q


class Address(models.Model):
    """A postal address. Orders reference their own address rows, which are
    never edited after the order is placed."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="addresses"
    )
    full_name = models.CharField(max_length=120)
    line1 = models.CharField(max_length=200)
    line2 = models.CharField(max_length=200, blank=True)
    city = models.CharField(max_length=100)
    region = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20)
    country = models.CharField(max_length=2, help_text="ISO 3166-1 alpha-2 code")
    phone = models.CharField(max_length=30, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "addresses"

    def __str__(self):
        return f"{self.full_name}, {self.line1}, {self.city}"

    def as_lines(self):
        parts = [self.full_name, self.line1, self.line2, " ".join(p for p in [self.city, self.region, self.postal_code] if p), self.country]
        return [p for p in parts if p]


def generate_reference() -> str:
    # Unambiguous alphabet (no 0/O/1/I) — easy to read out over the phone.
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "CZ-" + "".join(secrets.choice(alphabet) for _ in range(8))


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class Order(models.Model):
    class Status(models.TextChoices):
        PLACED = "placed", "Placed"
        PROCESSING = "processing", "Processing"
        SHIPPED = "shipped", "Shipped"
        DELIVERED = "delivered", "Delivered"
        CANCELLED = "cancelled", "Cancelled"

    class PaymentStatus(models.TextChoices):
        # Conzoomer runs a demo checkout: no money is ever collected.
        DEMO_NOT_CHARGED = "demo_not_charged", "Not charged"
        PAID = "paid", "Paid"
        REFUNDED = "refunded", "Refunded"

    reference = models.CharField(max_length=16, unique=True, default=generate_reference, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="orders"
    )
    email = models.EmailField()
    phone = models.CharField(max_length=30, blank=True)
    shipping_address = models.ForeignKey(Address, on_delete=models.PROTECT, related_name="+")
    billing_address = models.ForeignKey(Address, on_delete=models.PROTECT, related_name="+")

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PLACED, db_index=True)
    payment_status = models.CharField(
        max_length=24, choices=PaymentStatus.choices, default=PaymentStatus.DEMO_NOT_CHARGED
    )
    payment_provider = models.CharField(max_length=40, default="demo")

    currency = models.CharField(max_length=3)
    shipping_method = models.CharField(max_length=20)
    shipping_method_label = models.CharField(max_length=60)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    shipping_total = models.DecimalField(max_digits=12, decimal_places=2)
    discount_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_rate = models.DecimalField(max_digits=6, decimal_places=4)
    tax_total = models.DecimalField(max_digits=12, decimal_places=2)
    total = models.DecimalField(max_digits=12, decimal_places=2)

    # Client-generated key that makes checkout retries safe (one order per key).
    idempotency_key = models.CharField(max_length=64, unique=True)
    # Owner fingerprint for idempotent replays: user id or guest cart token.
    checkout_owner = models.CharField(max_length=80)
    # SHA-256 of the secret in guest confirmation links. The raw token is never stored.
    access_token_hash = models.CharField(max_length=64, editable=False)

    placed_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-placed_at"]
        indexes = [models.Index(fields=["user", "-placed_at"])]
        constraints = [
            models.CheckConstraint(condition=Q(total__gte=0), name="order_total_non_negative"),
            models.CheckConstraint(condition=Q(subtotal__gte=0), name="order_subtotal_non_negative"),
        ]

    def __str__(self):
        return self.reference

    def issue_access_token(self) -> str:
        token = secrets.token_urlsafe(32)
        self.access_token_hash = hash_token(token)
        return token

    def check_access_token(self, token: str | None) -> bool:
        if not token or not self.access_token_hash:
            return False
        return secrets.compare_digest(hash_token(token), self.access_token_hash)


class OrderItem(models.Model):
    """Snapshot of what was bought. Name and price are copied so history stays
    accurate when the catalog changes or a product is deleted."""

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey("catalog.Product", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    product_name = models.CharField(max_length=140)
    product_slug = models.CharField(max_length=160)
    sku = models.CharField(max_length=40)
    image_url = models.URLField(max_length=600, blank=True)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.PositiveIntegerField()
    line_total = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        ordering = ["id"]
        constraints = [models.CheckConstraint(condition=Q(quantity__gte=1), name="order_item_quantity_positive")]

    def __str__(self):
        return f"{self.quantity} × {self.product_name}"


class OrderStatusEvent(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="events")
    status = models.CharField(max_length=20, choices=Order.Status.choices)
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"{self.order.reference}: {self.status}"
