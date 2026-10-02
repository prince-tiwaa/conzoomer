from django.conf import settings
from rest_framework import serializers

from core.money import money_str

from .models import Category, Product, ProductImage

LOW_STOCK_THRESHOLD = 5


def stock_state(product: Product) -> str:
    if not product.is_active or product.stock <= 0:
        return "out_of_stock"
    if product.stock <= LOW_STOCK_THRESHOLD:
        return "low_stock"
    return "in_stock"


class CategorySerializer(serializers.ModelSerializer):
    product_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Category
        fields = ["id", "name", "slug", "tagline", "description", "image_url", "product_count"]


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ["url", "alt"]


class ProductCardSerializer(serializers.ModelSerializer):
    price = serializers.SerializerMethodField()
    currency = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()
    stock_status = serializers.SerializerMethodField()
    available = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id", "name", "slug", "short_description", "price", "currency", "category",
            "image", "stock_status", "available", "is_featured", "created_at",
        ]

    def get_price(self, obj):
        return money_str(obj.price)

    def get_currency(self, obj):
        return settings.CURRENCY_CODE

    def get_category(self, obj):
        return {"name": obj.category.name, "slug": obj.category.slug}

    def get_image(self, obj):
        image = obj.primary_image
        return ProductImageSerializer(image).data if image else None

    def get_stock_status(self, obj):
        return stock_state(obj)

    def get_available(self, obj):
        # Exact counts only when low, so the page can say "Only 3 left".
        if stock_state(obj) == "low_stock":
            return obj.stock
        return None


class ProductDetailSerializer(ProductCardSerializer):
    images = ProductImageSerializer(many=True, read_only=True)
    max_quantity = serializers.SerializerMethodField()

    class Meta(ProductCardSerializer.Meta):
        fields = ProductCardSerializer.Meta.fields + ["sku", "description", "details", "images", "max_quantity"]

    def get_max_quantity(self, obj):
        if not obj.is_active:
            return 0
        return min(obj.stock, settings.MAX_QUANTITY_PER_ITEM)
