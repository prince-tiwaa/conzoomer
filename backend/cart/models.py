import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class Cart(models.Model):
    """A shopping cart. Guests are identified by a random token kept in their
    (HttpOnly, server-side) Django session; signed-in shoppers by user."""

    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="carts"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user"], condition=Q(user__isnull=False), name="one_cart_per_user"),
        ]

    def __str__(self):
        return f"Cart {self.token} ({self.user or 'guest'})"


class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey("catalog.Product", on_delete=models.CASCADE, related_name="cart_items")
    quantity = models.PositiveIntegerField()
    # Price the shopper saw when adding; lets us flag price changes before checkout.
    unit_price_seen = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at", "id"]
        constraints = [
            models.UniqueConstraint(fields=["cart", "product"], name="unique_product_per_cart"),
            models.CheckConstraint(condition=Q(quantity__gte=1), name="cart_item_quantity_positive"),
        ]

    def __str__(self):
        return f"{self.quantity} × {self.product_id}"
