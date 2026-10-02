"""Authoritative price calculation. The browser never supplies amounts."""

from dataclasses import dataclass, field
from decimal import Decimal

from django.conf import settings

from core.exceptions import ApiError
from core.money import money_str, to_money

ZERO = Decimal("0.00")


@dataclass
class PricedLine:
    product: object
    quantity: int
    unit_price: Decimal
    line_total: Decimal


@dataclass
class Totals:
    currency: str
    lines: list = field(default_factory=list)
    item_count: int = 0
    subtotal: Decimal = ZERO
    shipping_method: str = ""
    shipping_method_label: str = ""
    shipping_total: Decimal = ZERO
    discount_total: Decimal = ZERO
    tax_rate: Decimal = ZERO
    tax_total: Decimal = ZERO
    total: Decimal = ZERO

    def as_dict(self):
        return {
            "currency": self.currency,
            "item_count": self.item_count,
            "subtotal": money_str(self.subtotal),
            "shipping_method": self.shipping_method,
            "shipping_method_label": self.shipping_method_label,
            "shipping_total": money_str(self.shipping_total),
            "discount_total": money_str(self.discount_total),
            "tax_rate": str(self.tax_rate),
            "tax_label": settings.TAX_LABEL,
            "tax_total": money_str(self.tax_total),
            "total": money_str(self.total),
        }


def shipping_price(method_code: str, subtotal: Decimal) -> Decimal:
    method = settings.SHIPPING_METHODS[method_code]
    threshold = settings.FREE_SHIPPING_THRESHOLD
    if method.get("free_over_threshold") and threshold > 0 and subtotal >= threshold:
        return ZERO
    return to_money(method["price"])


def shipping_options(subtotal: Decimal):
    return [
        {
            "code": code,
            "label": m["label"],
            "description": m["description"],
            "price": money_str(shipping_price(code, subtotal)),
            "base_price": money_str(m["price"]),
            "free_over_threshold": bool(m.get("free_over_threshold")),
        }
        for code, m in settings.SHIPPING_METHODS.items()
    ]


def validate_shipping_method(code: str) -> str:
    if code not in settings.SHIPPING_METHODS:
        raise ApiError(
            "Choose a shipping method.", code="validation_error", fields={"shipping_method": "Choose a shipping method."}
        )
    return code


def price_lines(pairs, shipping_method: str = "standard") -> Totals:
    """pairs: iterable of (product, quantity). Uses each product's current price."""
    totals = Totals(currency=settings.CURRENCY_CODE)
    for product, quantity in pairs:
        unit = to_money(product.price)
        line_total = to_money(unit * quantity)
        totals.lines.append(PricedLine(product, quantity, unit, line_total))
        totals.subtotal += line_total
        totals.item_count += quantity
    totals.subtotal = to_money(totals.subtotal)

    validate_shipping_method(shipping_method)
    totals.shipping_method = shipping_method
    totals.shipping_method_label = settings.SHIPPING_METHODS[shipping_method]["label"]
    totals.shipping_total = shipping_price(shipping_method, totals.subtotal) if totals.lines else ZERO

    # Demo tax: a flat configurable rate on merchandise after discounts.
    # Real tax depends on jurisdiction and product type; see README limitations.
    totals.tax_rate = settings.DEMO_TAX_RATE
    taxable = max(totals.subtotal - totals.discount_total, ZERO)
    totals.tax_total = to_money(taxable * totals.tax_rate)
    totals.total = to_money(totals.subtotal - totals.discount_total + totals.shipping_total + totals.tax_total)
    return totals
