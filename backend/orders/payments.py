"""Payment seam. Conzoomer ships with a demo provider that never charges.

To add a real processor (e.g. Stripe or Paystack): implement `PaymentProvider`,
create a payment intent before `place_order` commits, store the provider's
reference on the order, and mark `payment_status=paid` from a verified webhook —
never from the browser.
"""

from dataclasses import dataclass


@dataclass
class PaymentResult:
    provider: str
    status: str  # one of Order.PaymentStatus values


class PaymentProvider:
    name = "base"

    def process(self, order) -> PaymentResult:  # pragma: no cover - interface
        raise NotImplementedError


class DemoPaymentProvider(PaymentProvider):
    name = "demo"

    def process(self, order) -> PaymentResult:
        return PaymentResult(provider=self.name, status="demo_not_charged")


def get_payment_provider() -> PaymentProvider:
    return DemoPaymentProvider()
