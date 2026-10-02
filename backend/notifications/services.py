import logging
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone

from core.money import money_str

from .backends import get_backend
from .models import EmailDeliveryAttempt, EmailMessage

logger = logging.getLogger(__name__)

# Minutes to wait before attempt N+1.
BACKOFF_MINUTES = [1, 5, 15, 60, 180, 720]
STALE_CLAIM = timedelta(minutes=10)


def _fmt(amount, currency):
    symbol = {"USD": "$", "GBP": "£", "EUR": "€", "NGN": "₦", "CAD": "CA$", "AUD": "A$"}.get(currency, currency + " ")
    return f"{symbol}{money_str(amount)}"


def render_order_confirmation(order, access_token: str):
    from orders.serializers import COUNTRIES

    link = f"{settings.FRONTEND_URL}/orders/{order.reference}?token={access_token}"
    items = [
        {
            "name": i.product_name,
            "quantity": i.quantity,
            "unit_price": _fmt(i.unit_price, order.currency),
            "line_total": _fmt(i.line_total, order.currency),
            # Small square thumbnail for email (Unsplash URLs accept size params).
            "image_url": i.image_url.replace("w=1200&h=1500", "w=128&h=128") if i.image_url else "",
        }
        for i in order.items.all()
    ]
    ship = order.shipping_address
    context = {
        "order": order,
        "items": items,
        "link": link,
        "address_lines": ship.as_lines()[:-1] + [COUNTRIES.get(ship.country, ship.country)],
        "subtotal": _fmt(order.subtotal, order.currency),
        "shipping": _fmt(order.shipping_total, order.currency) if order.shipping_total else "Free",
        "tax": _fmt(order.tax_total, order.currency),
        "tax_label": settings.TAX_LABEL,
        "total": _fmt(order.total, order.currency),
        "frontend_url": settings.FRONTEND_URL,
        "support_email": settings.SUPPORT_EMAIL,
        "first_name": ship.full_name.split(" ")[0],
    }
    subject = f"Your Conzoomer order {order.reference}"
    text = render_to_string("emails/order_confirmation.txt", context)
    html = render_to_string("emails/order_confirmation.html", context)
    return subject, text, html


def queue_order_confirmation(order, access_token: str) -> EmailMessage:
    """Create the outbox row. Must be called inside the order transaction."""
    subject, text, html = render_order_confirmation(order, access_token)
    message, _ = EmailMessage.objects.get_or_create(
        dedupe_key=f"order_confirmation:{order.reference}",
        defaults={
            "kind": "order_confirmation",
            "order": order,
            "to_email": order.email,
            "subject": subject,
            "text_body": text,
            "html_body": html,
            "next_attempt_at": timezone.now(),
        },
    )
    return message


def schedule_delivery_after_commit(message_id: int):
    if settings.MAIL_SEND_ON_COMMIT:
        transaction.on_commit(lambda: _safe_deliver(message_id))


def _safe_deliver(message_id):
    try:
        deliver(message_id)
    except Exception:  # never let email problems surface to the shopper
        logger.exception("Email delivery crashed for message %s; it will be retried by the worker.", message_id)


def _claim(message_id) -> EmailMessage | None:
    """Atomically move a due message from pending → sending so two workers
    (or the request thread and the worker) can never send it twice."""
    with transaction.atomic():
        message = (
            EmailMessage.objects.select_for_update(skip_locked=True)
            .filter(pk=message_id, status=EmailMessage.Status.PENDING, next_attempt_at__lte=timezone.now())
            .first()
        )
        if message is None:
            return None
        message.status = EmailMessage.Status.SENDING
        message.claimed_at = timezone.now()
        message.attempts += 1
        message.save(update_fields=["status", "claimed_at", "attempts", "updated_at"])
        return message


def deliver(message_id) -> EmailMessage | None:
    message = _claim(message_id)
    if message is None:
        return None
    backend = get_backend()
    result = backend.send(message)
    EmailDeliveryAttempt.objects.create(
        message=message, backend=backend.name, succeeded=result.ok, status_code=result.status_code, error=result.error[:500]
    )
    message.backend = backend.name
    if result.ok:
        message.status = EmailMessage.Status.PREVIEWED if result.previewed else EmailMessage.Status.SENT
        message.provider_message_id = result.provider_message_id[:200]
        message.sent_at = timezone.now()
        message.last_error = ""
    else:
        message.last_error = result.error[:500]
        if result.permanent or message.attempts >= settings.MAIL_MAX_ATTEMPTS:
            message.status = EmailMessage.Status.FAILED
            logger.warning("Email %s failed permanently after %s attempts", message.pk, message.attempts)
        else:
            delay = BACKOFF_MINUTES[min(message.attempts - 1, len(BACKOFF_MINUTES) - 1)]
            message.status = EmailMessage.Status.PENDING
            message.next_attempt_at = timezone.now() + timedelta(minutes=delay)
            logger.info("Email %s attempt %s failed; retrying in %s min", message.pk, message.attempts, delay)
    message.save()
    return message


def release_stale_claims() -> int:
    """Recover messages stuck in 'sending' (e.g. the process died mid-send)."""
    return EmailMessage.objects.filter(
        status=EmailMessage.Status.SENDING, claimed_at__lt=timezone.now() - STALE_CLAIM
    ).update(status=EmailMessage.Status.PENDING)


def send_due(limit: int = 50) -> dict:
    release_stale_claims()
    due_ids = list(
        EmailMessage.objects.filter(status=EmailMessage.Status.PENDING, next_attempt_at__lte=timezone.now())
        .order_by("next_attempt_at")
        .values_list("pk", flat=True)[:limit]
    )
    stats = {"processed": 0, "sent": 0, "previewed": 0, "retrying": 0, "failed": 0}
    for pk in due_ids:
        message = deliver(pk)
        if message is None:
            continue
        stats["processed"] += 1
        key = {"sent": "sent", "previewed": "previewed", "pending": "retrying", "failed": "failed"}.get(message.status)
        if key:
            stats[key] += 1
    return stats


def retry_now(queryset) -> int:
    """Admin helper: make failed/pending messages due immediately."""
    return queryset.exclude(status__in=[EmailMessage.Status.SENT, EmailMessage.Status.SENDING]).update(
        status=EmailMessage.Status.PENDING, next_attempt_at=timezone.now()
    )
