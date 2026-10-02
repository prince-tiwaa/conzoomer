"""Order placement: one transaction, row locks, idempotency."""

import logging
import re

from django.db import IntegrityError, transaction
from django.db.models import F

from cart.models import Cart
from catalog.models import Product, ProductImage
from core.exceptions import ApiError
from core.money import money_str, to_money
from notifications.services import queue_order_confirmation, schedule_delivery_after_commit

from .models import Address, Order, OrderItem, OrderStatusEvent
from .payments import get_payment_provider
from .pricing import price_lines, validate_shipping_method

logger = logging.getLogger(__name__)
IDEMPOTENCY_RE = re.compile(r"^[A-Za-z0-9_-]{16,64}$")
SESSION_ORDERS_KEY = "guest_orders"


def validate_idempotency_key(key: str | None) -> str:
    if not key or not IDEMPOTENCY_RE.fullmatch(key):
        raise ApiError(
            "Missing or invalid Idempotency-Key header.", code="idempotency_key_required", status_code=400
        )
    return key


def owner_fingerprint(request, cart: Cart | None) -> str:
    if request.user.is_authenticated:
        return f"user:{request.user.pk}"
    return f"cart:{cart.token}" if cart else "guest:none"


def _replay(existing: Order, owner: str) -> Order:
    if existing.checkout_owner != owner:
        # Someone reused a key that isn't theirs. Don't reveal the order.
        raise ApiError("This checkout key has already been used.", code="idempotency_conflict", status_code=409)
    return existing


def remember_guest_order(request, order: Order):
    refs = request.session.get(SESSION_ORDERS_KEY, [])
    if order.reference not in refs:
        refs = (refs + [order.reference])[-20:]
        request.session[SESSION_ORDERS_KEY] = refs


def place_order(request, cart: Cart | None, data: dict, idempotency_key: str):
    """Create an order from the visitor's cart.

    Returns (order, access_token, replayed). `access_token` is only available
    on first creation (it is stored hashed); replays return None.
    """
    owner = owner_fingerprint(request, cart)
    existing = Order.objects.filter(idempotency_key=idempotency_key).first()
    if existing:
        return _replay(existing, owner), None, True
    if cart is None:
        raise ApiError("Your cart is empty.", code="cart_empty", status_code=409)

    shipping_method = validate_shipping_method(data["shipping_method"])

    try:
        with transaction.atomic():
            # 1. Serialize checkouts of the same cart (double clicks, two tabs).
            Cart.objects.select_for_update().get(pk=cart.pk)
            existing = Order.objects.filter(idempotency_key=idempotency_key).first()
            if existing:
                return _replay(existing, owner), None, True

            items = list(cart.items.order_by("product_id"))
            if not items:
                raise ApiError("Your cart is empty.", code="cart_empty", status_code=409)

            # 2. Lock the products in a stable order so concurrent checkouts
            #    can't deadlock, then re-read stock *after* acquiring the lock.
            ids = [i.product_id for i in items]
            products = {p.pk: p for p in Product.objects.select_for_update().filter(pk__in=ids).order_by("pk")}

            problems = []
            for item in items:
                p = products.get(item.product_id)
                if p is None or not p.is_active:
                    problems.append({"product_id": item.product_id, "available": 0, "message": "No longer available."})
                elif p.stock < item.quantity:
                    problems.append({
                        "product_id": p.pk,
                        "available": p.stock,
                        "message": f"Only {p.stock} of {p.name} left." if p.stock else f"{p.name} is sold out.",
                    })
            if problems:
                raise ApiError(
                    "Some items in your cart are no longer available in the quantity you chose.",
                    code="insufficient_stock",
                    status_code=409,
                    extra={"items": problems},
                )

            # 3. Price everything on the server from locked rows.
            totals = price_lines([(products[i.product_id], i.quantity) for i in items], shipping_method)
            expected = data.get("expected_total")
            if expected is not None and to_money(expected) != totals.total:
                raise ApiError(
                    "Prices or shipping changed since you last reviewed your order. Please check the new total.",
                    code="totals_changed",
                    status_code=409,
                    extra={"totals": totals.as_dict()},
                )

            user = request.user if request.user.is_authenticated else None
            phone = data.get("phone", "")
            ship = Address.objects.create(user=user, phone=phone, **data["shipping_address"])
            if data.get("billing_same_as_shipping", True):
                bill = ship
            else:
                bill = Address.objects.create(user=user, phone=phone, **data["billing_address"])

            order = Order(
                user=user,
                email=data["email"],
                phone=phone,
                shipping_address=ship,
                billing_address=bill,
                currency=totals.currency,
                shipping_method=totals.shipping_method,
                shipping_method_label=totals.shipping_method_label,
                subtotal=totals.subtotal,
                shipping_total=totals.shipping_total,
                discount_total=totals.discount_total,
                tax_rate=totals.tax_rate,
                tax_total=totals.tax_total,
                total=totals.total,
                idempotency_key=idempotency_key,
                checkout_owner=owner,
            )
            access_token = order.issue_access_token()
            payment = get_payment_provider().process(order)
            order.payment_provider = payment.provider
            order.payment_status = payment.status
            order.save()

            image_by_product = {}
            for img in ProductImage.objects.filter(product_id__in=ids).order_by("product_id", "position", "id"):
                image_by_product.setdefault(img.product_id, img.url)

            OrderItem.objects.bulk_create([
                OrderItem(
                    order=order,
                    product=line.product,
                    product_name=line.product.name,
                    product_slug=line.product.slug,
                    sku=line.product.sku,
                    image_url=image_by_product.get(line.product.pk, ""),
                    unit_price=line.unit_price,
                    quantity=line.quantity,
                    line_total=line.line_total,
                )
                for line in totals.lines
            ])

            # 4. Decrement stock atomically; the CHECK constraint is a final
            #    guard against ever going negative.
            for line in totals.lines:
                Product.objects.filter(pk=line.product.pk).update(stock=F("stock") - line.quantity)

            OrderStatusEvent.objects.create(order=order, status=Order.Status.PLACED, note="Demo order placed — no payment taken.")

            # 5. Queue the confirmation email in the same transaction (outbox).
            message = queue_order_confirmation(order, access_token)

            # 6. Empty the cart only as part of the committed order.
            cart.items.all().delete()
    except IntegrityError:
        # A concurrent request with the same key won the race.
        existing = Order.objects.filter(idempotency_key=idempotency_key).first()
        if existing:
            return _replay(existing, owner), None, True
        raise

    schedule_delivery_after_commit(message.pk)
    logger.info("Order %s placed (%s items, total %s %s)", order.reference, totals.item_count, money_str(order.total), order.currency)
    return order, access_token, False


def can_view_order(request, order: Order, token: str | None) -> bool:
    user = request.user
    if user.is_authenticated and order.user_id == user.pk:
        return True
    if order.reference in request.session.get(SESSION_ORDERS_KEY, []):
        return True
    return order.check_access_token(token)
