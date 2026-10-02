from django.db import models
from django.db.models import Q


class EmailMessage(models.Model):
    """Durable outbox row. Written in the same transaction as the order, then
    delivered after commit and retried by `manage.py send_pending_emails`.
    A Mailgun outage therefore never rolls back or blocks an order."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SENDING = "sending", "Sending"
        SENT = "sent", "Sent via Mailgun"
        PREVIEWED = "previewed", "Saved as local preview (not sent)"
        FAILED = "failed", "Failed (gave up)"

    kind = models.CharField(max_length=40)
    # e.g. "order_confirmation:CZ-ABCD2345" — the unique key prevents duplicate emails.
    dedupe_key = models.CharField(max_length=120, unique=True)
    order = models.ForeignKey("orders.Order", null=True, blank=True, on_delete=models.CASCADE, related_name="emails")
    to_email = models.EmailField()
    subject = models.CharField(max_length=200)
    text_body = models.TextField()
    html_body = models.TextField()

    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING, db_index=True)
    backend = models.CharField(max_length=20, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    next_attempt_at = models.DateTimeField(db_index=True)
    last_error = models.CharField(max_length=500, blank=True)
    provider_message_id = models.CharField(max_length=200, blank=True)
    claimed_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "next_attempt_at"], name="email_due_idx", condition=Q(status="pending")),
        ]

    def __str__(self):
        return f"{self.kind} → {self.to_email} ({self.status})"


class EmailDeliveryAttempt(models.Model):
    message = models.ForeignKey(EmailMessage, on_delete=models.CASCADE, related_name="delivery_attempts")
    backend = models.CharField(max_length=20)
    succeeded = models.BooleanField()
    status_code = models.PositiveSmallIntegerField(null=True, blank=True)
    error = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
