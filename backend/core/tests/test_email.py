from datetime import timedelta
from unittest import mock

import requests
from django.test import TestCase, override_settings
from django.utils import timezone

from notifications.models import EmailMessage
from notifications.services import deliver, send_due
from orders.models import Order

from .helpers import checkout_payload, csrf_client, make_product, new_key

MAILGUN = dict(MAIL_BACKEND="mailgun", MAILGUN_API_KEY="key-test", MAILGUN_DOMAIN="mg.example.com", MAILGUN_REGION="eu")


def fake_response(status, payload):
    r = mock.Mock()
    r.status_code = status
    r.json.return_value = payload
    r.text = str(payload)
    return r


class EmailTests(TestCase):
    def setUp(self):
        self.product = make_product("Lamp", "20.00", stock=50)
        self.client = csrf_client()

    def place(self):
        self.client.post("/api/cart/items/", {"product_id": self.product.pk, "quantity": 2}, format="json")
        with self.captureOnCommitCallbacks(execute=True):
            r = self.client.post("/api/checkout/", checkout_payload(), format="json", HTTP_IDEMPOTENCY_KEY=new_key())
        self.assertEqual(r.status_code, 201, r.content)
        return r

    @override_settings(**MAILGUN)
    def test_mailgun_success(self):
        with mock.patch("notifications.backends.requests.post", return_value=fake_response(200, {"id": "<abc@mg>"})) as post:
            self.place()
        msg = EmailMessage.objects.get()
        self.assertEqual(msg.status, "sent")
        self.assertEqual(msg.provider_message_id, "<abc@mg>")
        url = post.call_args.args[0]
        self.assertEqual(url, "https://api.eu.mailgun.net/v3/mg.example.com/messages")
        data = post.call_args.kwargs["data"]
        self.assertIn(Order.objects.get().reference, data["subject"])
        self.assertIn("demo", data["text"].lower())
        self.assertIn("View your order", data["html"])
        self.assertIn("?token=", data["text"])
        self.assertEqual(post.call_args.kwargs["auth"], ("api", "key-test"))

    @override_settings(**MAILGUN)
    def test_mailgun_outage_keeps_order_and_schedules_retry(self):
        with mock.patch("notifications.backends.requests.post", side_effect=requests.ConnectionError("down")):
            r = self.place()
        self.assertEqual(Order.objects.count(), 1)
        self.assertEqual(r.json()["order"]["reference"], Order.objects.get().reference)
        msg = EmailMessage.objects.get()
        self.assertEqual(msg.status, "pending")
        self.assertEqual(msg.attempts, 1)
        self.assertGreater(msg.next_attempt_at, timezone.now())
        self.assertEqual(msg.delivery_attempts.count(), 1)

        # Not due yet → worker does nothing.
        self.assertEqual(send_due()["processed"], 0)

        # Once due, the worker retries and succeeds.
        EmailMessage.objects.update(next_attempt_at=timezone.now() - timedelta(seconds=1))
        with mock.patch("notifications.backends.requests.post", return_value=fake_response(200, {"id": "x"})):
            stats = send_due()
        self.assertEqual(stats["sent"], 1)
        msg.refresh_from_db()
        self.assertEqual((msg.status, msg.attempts), ("sent", 2))

    @override_settings(MAIL_MAX_ATTEMPTS=2, **MAILGUN)
    def test_gives_up_after_max_attempts(self):
        with mock.patch("notifications.backends.requests.post", return_value=fake_response(503, {"message": "busy"})):
            self.place()
            EmailMessage.objects.update(next_attempt_at=timezone.now())
            send_due()
        msg = EmailMessage.objects.get()
        self.assertEqual((msg.status, msg.attempts), ("failed", 2))
        self.assertIn("503", msg.last_error)

    @override_settings(**MAILGUN)
    def test_permanent_rejection_is_not_retried(self):
        with mock.patch("notifications.backends.requests.post", return_value=fake_response(400, {"message": "bad to"})):
            self.place()
        self.assertEqual(EmailMessage.objects.get().status, "failed")

    @override_settings(**MAILGUN)
    def test_sent_email_is_never_sent_twice(self):
        with mock.patch("notifications.backends.requests.post", return_value=fake_response(200, {"id": "x"})) as post:
            self.place()
            msg = EmailMessage.objects.get()
            self.assertIsNone(deliver(msg.pk))
            send_due()
        self.assertEqual(post.call_count, 1)

    @override_settings(MAIL_BACKEND="preview")
    def test_preview_backend_is_clearly_not_a_real_send(self):
        r = self.place()
        msg = EmailMessage.objects.get()
        self.assertEqual(msg.status, "previewed")
        ref = Order.objects.get().reference
        detail = self.client.get(f"/api/orders/{ref}/").json()["order"]
        self.assertEqual(detail["email_delivery"]["status"], "previewed")
        preview = self.client.get(f"/api/orders/{ref}/email-preview/")
        self.assertEqual(preview.status_code, 200)
        self.assertIn(ref, preview.content.decode())
        # Strangers can't read the preview.
        self.assertEqual(csrf_client().get(f"/api/orders/{ref}/email-preview/").status_code, 404)

    @override_settings(MAIL_BACKEND="mailgun", MAILGUN_API_KEY=None, MAILGUN_DOMAIN=None)
    def test_missing_mailgun_config_is_a_retryable_failure(self):
        self.place()
        msg = EmailMessage.objects.get()
        self.assertEqual(msg.status, "pending")
        self.assertIn("not configured", msg.last_error)

    @override_settings(**MAILGUN)
    def test_sandbox_unauthorized_recipient_is_not_retried(self):
        reply = {"message": "Domain sandbox123.mailgun.org is not allowed to send: Free accounts are for test purposes only."}
        with mock.patch("notifications.backends.requests.post", return_value=fake_response(403, reply)):
            self.place()
        msg = EmailMessage.objects.get()
        self.assertEqual((msg.status, msg.attempts), ("failed", 1))
