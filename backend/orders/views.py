from django.conf import settings
from django.core.paginator import Paginator
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from cart.services import get_cart, reconcile
from core.exceptions import ApiError
from core.money import money_str
from notifications.models import EmailMessage

from .models import Order
from .pricing import price_lines, shipping_options
from .serializers import COUNTRIES, CheckoutSerializer, OrderDetailSerializer, OrderSummarySerializer
from .services import can_view_order, place_order, remember_guest_order, validate_idempotency_key


def order_queryset():
    return Order.objects.select_related("shipping_address", "billing_address").prefetch_related("items", "events", "emails")


class CheckoutConfigView(APIView):
    throttle_scope = "cart"

    def get(self, request):
        cart = get_cart(request)
        items = list(cart.items.select_related("product")) if cart else []
        subtotal = price_lines([(i.product, i.quantity) for i in items]).subtotal
        user = request.user if request.user.is_authenticated else None
        return Response({
            "currency": settings.CURRENCY_CODE,
            "shipping_methods": shipping_options(subtotal),
            "free_shipping_threshold": money_str(settings.FREE_SHIPPING_THRESHOLD),
            "tax_rate": str(settings.DEMO_TAX_RATE),
            "tax_label": settings.TAX_LABEL,
            "countries": [{"code": c, "name": n} for c, n in COUNTRIES.items()],
            "prefill": {"email": user.email, "full_name": user.get_full_name()} if user else None,
            "payment_mode": "demo",
        })


class CheckoutQuoteView(APIView):
    """Server-side totals for the current cart and a shipping method."""

    throttle_scope = "cart"

    def post(self, request):
        cart = get_cart(request)
        notices = reconcile(cart)
        items = list(cart.items.select_related("product")) if cart else []
        totals = price_lines([(i.product, i.quantity) for i in items], request.data.get("shipping_method") or "standard")
        return Response({"totals": totals.as_dict(), "notices": notices, "empty": not items})


class CheckoutView(APIView):
    throttle_scope = "checkout"

    def post(self, request):
        key = validate_idempotency_key(request.headers.get("Idempotency-Key"))
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cart = get_cart(request)
        order, access_token, replayed = place_order(request, cart, serializer.validated_data, key)
        if not request.user.is_authenticated:
            remember_guest_order(request, order)
        order = order_queryset().get(pk=order.pk)
        return Response(
            {"order": OrderDetailSerializer(order).data, "access_token": access_token, "replayed": replayed},
            status=200 if replayed else 201,
        )


class OrderLookupView(APIView):
    """Order confirmation for its owner, the browser session that placed it, or
    a holder of the secret link token. Everyone else gets a 404."""

    throttle_scope = "order_lookup"

    def get(self, request, reference):
        order = order_queryset().filter(reference=reference.upper()).first()
        if order is None or not can_view_order(request, order, request.query_params.get("token")):
            raise ApiError("We couldn't find that order.", code="not_found", status_code=404)
        return Response({"order": OrderDetailSerializer(order).data})


class OrderEmailPreviewView(APIView):
    """Shows the locally saved confirmation email when Mailgun isn't configured."""

    throttle_scope = "order_lookup"

    def get(self, request, reference):
        order = Order.objects.filter(reference=reference.upper()).first()
        if order is None or not can_view_order(request, order, request.query_params.get("token")):
            raise ApiError("We couldn't find that order.", code="not_found", status_code=404)
        message = get_object_or_404(EmailMessage, order=order, kind="order_confirmation")
        if message.status != EmailMessage.Status.PREVIEWED:
            raise ApiError("No local preview exists for this email.", code="not_found", status_code=404)
        response = HttpResponse(message.html_body, content_type="text/html; charset=utf-8")
        response["Content-Security-Policy"] = "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'"
        response["X-Frame-Options"] = "SAMEORIGIN"
        return response


class AccountOrdersView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_scope = "order_lookup"

    def get(self, request):
        qs = Order.objects.filter(user=request.user).prefetch_related("items").order_by("-placed_at")
        try:
            page_number = max(1, int(request.query_params.get("page") or 1))
        except ValueError:
            page_number = 1
        paginator = Paginator(qs, 10)
        page = paginator.get_page(page_number)
        return Response({
            "count": paginator.count,
            "page": page.number,
            "num_pages": paginator.num_pages,
            "results": OrderSummarySerializer(page.object_list, many=True).data,
        })


class AccountOrderDetailView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_scope = "order_lookup"

    def get(self, request, reference):
        # Ownership is part of the query: other users' orders simply don't exist here.
        order = get_object_or_404(order_queryset(), reference=reference.upper(), user=request.user)
        return Response({"order": OrderDetailSerializer(order).data})
