"""Cart lookup, mutation, reconciliation and guest→user merge."""

import logging

from django.conf import settings
from django.db import IntegrityError, transaction

from catalog.models import Product
from core.exceptions import ApiError
from core.money import money_str, to_money

from .models import Cart, CartItem

logger = logging.getLogger(__name__)
SESSION_KEY = "cart_token"


def get_cart(request, create=False) -> Cart | None:
    """Return the visitor's cart: the user's cart when signed in, otherwise the
    guest cart referenced by the session. Optionally create one."""
    user = request.user
    if user.is_authenticated:
        cart = Cart.objects.filter(user=user).first()
        if cart is None and create:
            try:
                with transaction.atomic():
                    cart = Cart.objects.create(user=user)
            except IntegrityError:  # created concurrently
                cart = Cart.objects.get(user=user)
        return cart

    token = request.session.get(SESSION_KEY)
    cart = Cart.objects.filter(token=token, user__isnull=True).first() if token else None
    if cart is None and create:
        cart = Cart.objects.create()
        request.session[SESSION_KEY] = str(cart.token)
    return cart


def max_allowed(product: Product) -> int:
    if not product.is_active:
        return 0
    return min(product.stock, settings.MAX_QUANTITY_PER_ITEM)


def _validate_quantity(quantity) -> int:
    try:
        if isinstance(quantity, bool) or (isinstance(quantity, float) and not quantity.is_integer()):
            raise ValueError
        if isinstance(quantity, str) and not quantity.strip().isdigit():
            raise ValueError
        quantity = int(quantity)
    except (TypeError, ValueError):
        raise ApiError("Quantity must be a whole number.", code="invalid_quantity", fields={"quantity": "Enter a whole number."})
    if quantity < 1:
        raise ApiError("Quantity must be at least 1.", code="invalid_quantity", fields={"quantity": "Must be at least 1."})
    if quantity > settings.MAX_QUANTITY_PER_ITEM:
        raise ApiError(
            f"You can add up to {settings.MAX_QUANTITY_PER_ITEM} of each item.",
            code="invalid_quantity",
            fields={"quantity": f"Maximum is {settings.MAX_QUANTITY_PER_ITEM}."},
        )
    return quantity


def _get_product(product_id) -> Product:
    try:
        return Product.objects.get(pk=int(product_id), is_active=True)
    except (Product.DoesNotExist, TypeError, ValueError):
        raise ApiError("That product is no longer available.", code="product_unavailable", status_code=404)


def _stock_error(product, available):
    if available <= 0:
        return ApiError(f"{product.name} is out of stock.", code="out_of_stock", status_code=409, extra={"available": 0})
    return ApiError(
        f"Only {available} of {product.name} available.",
        code="insufficient_stock",
        status_code=409,
        extra={"available": available},
    )


def add_item(request, product_id, quantity) -> CartItem:
    quantity = _validate_quantity(quantity)
    product = _get_product(product_id)
    cart = get_cart(request, create=True)
    with transaction.atomic():
        item = CartItem.objects.select_for_update().filter(cart=cart, product=product).first()
        new_qty = (item.quantity if item else 0) + quantity
        limit = max_allowed(product)
        if new_qty > limit:
            in_cart = item.quantity if item else 0
            if limit <= 0:
                raise _stock_error(product, 0)
            if new_qty > settings.MAX_QUANTITY_PER_ITEM and product.stock >= settings.MAX_QUANTITY_PER_ITEM:
                raise ApiError(
                    f"You can add up to {settings.MAX_QUANTITY_PER_ITEM} of each item"
                    + (f" (you already have {in_cart})." if in_cart else "."),
                    code="invalid_quantity",
                    status_code=409,
                    extra={"available": limit - in_cart},
                )
            raise ApiError(
                f"Only {limit} of {product.name} available"
                + (f" and {in_cart} already in your cart." if in_cart else "."),
                code="insufficient_stock",
                status_code=409,
                extra={"available": max(limit - in_cart, 0)},
            )
        if item:
            item.quantity = new_qty
            item.unit_price_seen = product.price
            item.save(update_fields=["quantity", "unit_price_seen", "updated_at"])
        else:
            item = CartItem.objects.create(cart=cart, product=product, quantity=quantity, unit_price_seen=product.price)
        cart.save(update_fields=["updated_at"])
    return item


def _get_item(request, item_id) -> CartItem:
    cart = get_cart(request)
    try:
        if cart is None:
            raise CartItem.DoesNotExist
        return CartItem.objects.select_related("product").get(pk=int(item_id), cart=cart)
    except (CartItem.DoesNotExist, TypeError, ValueError):
        # Same answer whether the item doesn't exist or belongs to someone else.
        raise ApiError("That item isn't in your cart.", code="not_found", status_code=404)


def update_item(request, item_id, quantity) -> CartItem:
    quantity = _validate_quantity(quantity)
    item = _get_item(request, item_id)
    product = item.product
    limit = max_allowed(product)
    if quantity > limit:
        raise _stock_error(product, limit)
    item.quantity = quantity
    item.unit_price_seen = product.price
    item.save(update_fields=["quantity", "unit_price_seen", "updated_at"])
    return item


def remove_item(request, item_id):
    _get_item(request, item_id).delete()


def reconcile(cart: Cart) -> list[dict]:
    """Bring the cart in line with current stock and prices. Returns notices
    describing anything that changed, so the shopper is never surprised at
    checkout."""
    notices = []
    if cart is None:
        return notices
    for item in list(cart.items.select_related("product")):
        product = item.product
        limit = max_allowed(product)
        if limit <= 0:
            notices.append({
                "type": "removed",
                "product_name": product.name,
                "message": f"{product.name} sold out and was removed from your cart.",
            })
            item.delete()
            continue
        changed = []
        if item.quantity > limit:
            notices.append({
                "type": "quantity_reduced",
                "product_name": product.name,
                "message": f"Only {limit} of {product.name} available — we updated your quantity.",
            })
            item.quantity = limit
            changed.append("quantity")
        if to_money(item.unit_price_seen) != to_money(product.price):
            direction = "dropped" if product.price < item.unit_price_seen else "changed"
            notices.append({
                "type": "price_changed",
                "product_name": product.name,
                "old_price": money_str(item.unit_price_seen),
                "new_price": money_str(product.price),
                "message": f"The price of {product.name} {direction} since you added it.",
            })
            item.unit_price_seen = product.price
            changed.append("unit_price_seen")
        if changed:
            item.save(update_fields=changed + ["updated_at"])
    return notices


def merge_guest_cart_into_user(request, user):
    """Called on login. Moves guest items into the user's cart.

    Rule: for a product in both carts the larger quantity wins (we never add
    them together, which would surprise someone who added the same item while
    signed out), capped at stock and the per-item limit.
    """
    token = request.session.pop(SESSION_KEY, None)
    if not token:
        return
    with transaction.atomic():
        guest = Cart.objects.select_for_update().filter(token=token, user__isnull=True).first()
        if guest is None:
            return
        user_cart = Cart.objects.select_for_update().filter(user=user).first()
        if user_cart is None:
            guest.user = user
            guest.save(update_fields=["user", "updated_at"])
            return
        existing = {i.product_id: i for i in user_cart.items.select_for_update()}
        for g in guest.items.select_related("product"):
            limit = max_allowed(g.product)
            if limit <= 0:
                continue
            if g.product_id in existing:
                u = existing[g.product_id]
                merged = min(max(u.quantity, g.quantity), limit)
                if merged != u.quantity:
                    u.quantity = merged
                    u.save(update_fields=["quantity", "updated_at"])
            else:
                CartItem.objects.create(
                    cart=user_cart, product=g.product, quantity=min(g.quantity, limit), unit_price_seen=g.unit_price_seen
                )
        guest.delete()
    logger.info("Merged guest cart into user %s", user.pk)
