from django.db import models
from django.db.models import Q


class Category(models.Model):
    name = models.CharField(max_length=80, unique=True)
    slug = models.SlugField(max_length=80, unique=True)
    tagline = models.CharField(max_length=160, blank=True)
    description = models.TextField(blank=True)
    image_url = models.URLField(max_length=500, blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "name"]
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name


class Product(models.Model):
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    name = models.CharField(max_length=140)
    slug = models.SlugField(max_length=160, unique=True)
    sku = models.CharField(max_length=40, unique=True)
    short_description = models.CharField(max_length=220)
    description = models.TextField()
    price = models.DecimalField(max_digits=10, decimal_places=2)
    stock = models.PositiveIntegerField(default=0, help_text="Units available to sell.")
    is_active = models.BooleanField(default=True, help_text="Inactive products are hidden and cannot be bought.")
    is_featured = models.BooleanField(default=False)
    details = models.JSONField(
        default=list, blank=True, help_text='List of {"label": ..., "value": ...} pairs shown on the product page.'
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "id"]
        indexes = [
            models.Index(fields=["is_active", "category"]),
            models.Index(fields=["is_active", "price"]),
            models.Index(fields=["is_active", "is_featured"]),
        ]
        constraints = [
            models.CheckConstraint(condition=Q(price__gt=0), name="product_price_positive"),
            models.CheckConstraint(condition=Q(stock__gte=0), name="product_stock_non_negative"),
        ]

    def __str__(self):
        return self.name

    @property
    def primary_image(self):
        images = list(self.images.all())
        return images[0] if images else None


class ProductImage(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="images")
    url = models.URLField(max_length=600)
    alt = models.CharField(max_length=200)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self):
        return f"{self.product.name} #{self.position}"
