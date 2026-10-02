from django.contrib import admin

from .models import Address, Order, OrderItem, OrderStatusEvent


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    can_delete = False
    readonly_fields = ["product_name", "sku", "unit_price", "quantity", "line_total", "product"]
    fields = readonly_fields

    def has_add_permission(self, request, obj=None):
        return False


class OrderStatusEventInline(admin.TabularInline):
    model = OrderStatusEvent
    extra = 0
    readonly_fields = ["status", "note", "created_at"]

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["reference", "email", "status", "payment_status", "total", "currency", "placed_at"]
    list_filter = ["status", "payment_status", "placed_at"]
    search_fields = ["reference", "email", "shipping_address__full_name"]
    date_hierarchy = "placed_at"
    inlines = [OrderItemInline, OrderStatusEventInline]
    readonly_fields = [
        "reference", "user", "email", "phone", "shipping_address", "billing_address", "payment_status",
        "payment_provider", "currency", "shipping_method", "shipping_method_label", "subtotal", "shipping_total",
        "discount_total", "tax_rate", "tax_total", "total", "idempotency_key", "placed_at", "updated_at",
    ]
    exclude = ["checkout_owner", "access_token_hash"]

    def save_model(self, request, obj, form, change):
        if change and "status" in form.changed_data:
            super().save_model(request, obj, form, change)
            OrderStatusEvent.objects.create(order=obj, status=obj.status, note=f"Updated by {request.user.get_username()}")
        else:
            super().save_model(request, obj, form, change)

    def has_add_permission(self, request):
        return False  # orders are created by checkout only


@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display = ["full_name", "city", "country", "user", "created_at"]
    search_fields = ["full_name", "city", "postal_code"]
