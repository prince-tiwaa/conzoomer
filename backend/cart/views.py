from django.conf import settings
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.serializers import ProductImageSerializer, stock_state
from core.money import money_str
from orders.pricing import price_lines

from . import services


def serialize_cart(cart, notices=None):
    items = list(cart.items.select_related("product__category").prefetch_related("product__images")) if cart else []
    totals = price_lines([(i.product, i.quantity) for i in items], "standard")
    data_items = []
    for item, line in zip(items, totals.lines):
        p = item.product
        image = p.primary_image
        data_items.append({
            "id": item.id,
            "quantity": item.quantity,
            "unit_price": money_str(line.unit_price),
            "line_total": money_str(line.line_total),
            "product": {
                "id": p.id,
                "slug": p.slug,
                "name": p.name,
                "category": p.category.name,
                "image": ProductImageSerializer(image).data if image else None,
                "stock_status": stock_state(p),
                "max_quantity": services.max_allowed(p),
            },
        })
    return {
        "items": data_items,
        "item_count": totals.item_count,
        "currency": settings.CURRENCY_CODE,
        "subtotal": money_str(totals.subtotal),
        "estimate": totals.as_dict(),
        "free_shipping_threshold": money_str(settings.FREE_SHIPPING_THRESHOLD),
        "notices": notices or [],
    }


class CartView(APIView):
    throttle_scope = "cart"

    def get(self, request):
        cart = services.get_cart(request)
        notices = services.reconcile(cart)
        return Response(serialize_cart(cart, notices))


class CartItemsView(APIView):
    throttle_scope = "cart"

    def post(self, request):
        services.add_item(request, request.data.get("product_id"), request.data.get("quantity", 1))
        cart = services.get_cart(request)
        return Response(serialize_cart(cart), status=201)


class CartItemDetailView(APIView):
    throttle_scope = "cart"

    def patch(self, request, item_id):
        services.update_item(request, item_id, request.data.get("quantity"))
        return Response(serialize_cart(services.get_cart(request)))

    def delete(self, request, item_id):
        services.remove_item(request, item_id)
        return Response(serialize_cart(services.get_cart(request)))
