from django.contrib import admin
from django.utils.html import format_html

from .models import Category, Product, ProductImage


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "sort_order"]
    prepopulated_fields = {"slug": ["name"]}
    list_editable = ["sort_order"]


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1
    fields = ["preview", "url", "alt", "position"]
    readonly_fields = ["preview"]

    @admin.display(description="Preview")
    def preview(self, obj):
        if obj and obj.url:
            return format_html('<img src="{}" style="height:56px;width:56px;object-fit:cover;border-radius:6px">', obj.url)
        return "—"


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ["name", "category", "price", "stock", "stock_flag", "is_active", "is_featured", "updated_at"]
    list_filter = ["category", "is_active", "is_featured"]
    list_editable = ["price", "stock", "is_active", "is_featured"]
    search_fields = ["name", "sku", "description"]
    prepopulated_fields = {"slug": ["name"]}
    inlines = [ProductImageInline]
    readonly_fields = ["created_at", "updated_at"]
    fieldsets = [
        (None, {"fields": ["name", "slug", "sku", "category"]}),
        ("Copy", {"fields": ["short_description", "description", "details"]}),
        ("Pricing & inventory", {"fields": ["price", "stock", "is_active", "is_featured"]}),
        ("Timestamps", {"fields": ["created_at", "updated_at"]}),
    ]

    @admin.display(description="Stock level")
    def stock_flag(self, obj):
        if obj.stock == 0:
            return format_html('<b style="color:#A11E1E">Sold out</b>')
        if obj.stock <= 5:
            return format_html('<b style="color:#9A5B00">Low</b>')
        return "OK"
