import re

from rest_framework import serializers

from core.money import money_str

from .models import Address, Order, OrderItem

COUNTRIES = {
    "US": "United States",
    "GB": "United Kingdom",
    "CA": "Canada",
    "IE": "Ireland",
    "NG": "Nigeria",
    "DE": "Germany",
    "FR": "France",
    "NL": "Netherlands",
    "AU": "Australia",
}
POSTAL_OPTIONAL = {"NG", "IE"}
PHONE_RE = re.compile(r"^[0-9+()\-.\s]{7,30}$")


def clean_text(value: str) -> str:
    return " ".join((value or "").split())


class AddressInputSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=120, error_messages={"blank": "Enter the recipient's full name."})
    line1 = serializers.CharField(max_length=200, error_messages={"blank": "Enter the street address."})
    line2 = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    city = serializers.CharField(max_length=100, error_messages={"blank": "Enter the town or city."})
    region = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    postal_code = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    country = serializers.ChoiceField(
        choices=list(COUNTRIES.items()), error_messages={"invalid_choice": "We don't ship to that country yet."}
    )

    def validate(self, attrs):
        for key in ("full_name", "line1", "line2", "city", "region", "postal_code"):
            attrs[key] = clean_text(attrs.get(key, ""))
        if len(attrs["full_name"]) < 2:
            raise serializers.ValidationError({"full_name": "Enter the recipient's full name."})
        if attrs["country"] not in POSTAL_OPTIONAL and not attrs["postal_code"]:
            raise serializers.ValidationError({"postal_code": "Enter a postal code."})
        if attrs["country"] == "US" and attrs["postal_code"] and not re.fullmatch(r"\d{5}(-\d{4})?", attrs["postal_code"]):
            raise serializers.ValidationError({"postal_code": "Enter a 5-digit ZIP code."})
        if attrs["country"] == "US" and not attrs["region"]:
            raise serializers.ValidationError({"region": "Enter a state."})
        attrs["postal_code"] = attrs["postal_code"].upper()
        return attrs


class CheckoutSerializer(serializers.Serializer):
    email = serializers.EmailField(error_messages={"invalid": "Enter a valid email address.", "blank": "Enter your email address."})
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    shipping_address = AddressInputSerializer()
    billing_same_as_shipping = serializers.BooleanField(default=True)
    billing_address = AddressInputSerializer(required=False, allow_null=True)
    shipping_method = serializers.CharField(max_length=20)
    # Optional guard: the total the shopper saw. If the server's total differs we
    # refuse and return fresh numbers rather than charging an unexpected amount.
    expected_total = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)

    def validate_phone(self, value):
        value = value.strip()
        if value and not PHONE_RE.fullmatch(value):
            raise serializers.ValidationError("Enter a valid phone number.")
        return value

    def validate_email(self, value):
        return value.strip().lower()

    def validate(self, attrs):
        if not attrs.get("billing_same_as_shipping") and not attrs.get("billing_address"):
            raise serializers.ValidationError({"billing_address": "Enter a billing address or use the shipping address."})
        return attrs


def address_data(address: Address):
    return {
        "full_name": address.full_name,
        "line1": address.line1,
        "line2": address.line2,
        "city": address.city,
        "region": address.region,
        "postal_code": address.postal_code,
        "country": address.country,
        "country_name": COUNTRIES.get(address.country, address.country),
        "phone": address.phone,
    }


class OrderItemSerializer(serializers.ModelSerializer):
    unit_price = serializers.SerializerMethodField()
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = ["id", "product_name", "product_slug", "sku", "image_url", "unit_price", "quantity", "line_total"]

    def get_unit_price(self, obj):
        return money_str(obj.unit_price)

    def get_line_total(self, obj):
        return money_str(obj.line_total)


def email_status(order):
    msg = next(iter(order.emails.all()), None) if hasattr(order, "emails") else None
    if msg is None:
        return {"status": "none", "message": "No confirmation email was queued."}
    messages = {
        "pending": "Your confirmation email is queued and will be sent shortly.",
        "sending": "Your confirmation email is being sent.",
        "sent": f"A confirmation email was sent to {order.email}.",
        "previewed": "Email delivery isn't configured in this environment — a local preview was saved instead.",
        "failed": "We couldn't send your confirmation email. Your order is still confirmed.",
    }
    return {"status": msg.status, "message": messages.get(msg.status, ""), "preview_available": msg.status == "previewed"}


class OrderSummarySerializer(serializers.ModelSerializer):
    total = serializers.SerializerMethodField()
    item_count = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display")

    class Meta:
        model = Order
        fields = ["reference", "status", "status_label", "placed_at", "currency", "total", "item_count"]

    def get_total(self, obj):
        return money_str(obj.total)

    def get_item_count(self, obj):
        return sum(i.quantity for i in obj.items.all())


class OrderDetailSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    shipping_address = serializers.SerializerMethodField()
    billing_address = serializers.SerializerMethodField()
    totals = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display")
    payment_status_label = serializers.CharField(source="get_payment_status_display")
    email_delivery = serializers.SerializerMethodField()
    events = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "reference", "status", "status_label", "payment_status", "payment_status_label", "placed_at",
            "email", "phone", "currency", "shipping_method", "shipping_method_label", "items",
            "shipping_address", "billing_address", "totals", "email_delivery", "events",
        ]

    def get_shipping_address(self, obj):
        return address_data(obj.shipping_address)

    def get_billing_address(self, obj):
        return address_data(obj.billing_address)

    def get_totals(self, obj):
        return {
            "subtotal": money_str(obj.subtotal),
            "shipping_total": money_str(obj.shipping_total),
            "discount_total": money_str(obj.discount_total),
            "tax_rate": str(obj.tax_rate),
            "tax_total": money_str(obj.tax_total),
            "total": money_str(obj.total),
        }

    def get_email_delivery(self, obj):
        return email_status(obj)

    def get_events(self, obj):
        return [{"status": e.status, "label": e.get_status_display(), "note": e.note, "at": e.created_at} for e in obj.events.all()]
