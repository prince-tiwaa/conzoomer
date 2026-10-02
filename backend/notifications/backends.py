"""Email delivery backends.

* PreviewBackend — development default. Saves the rendered email to
  backend/var/email-previews/ and marks it "previewed". Nothing is sent.
* MailgunBackend — real delivery through Mailgun's HTTP API.
"""

import logging
from dataclasses import dataclass

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


@dataclass
class DeliveryResult:
    ok: bool
    provider_message_id: str = ""
    status_code: int | None = None
    error: str = ""
    permanent: bool = False  # True when retrying cannot help
    previewed: bool = False


class PreviewBackend:
    name = "preview"

    def send(self, message) -> DeliveryResult:
        directory = settings.EMAIL_PREVIEW_DIR
        directory.mkdir(parents=True, exist_ok=True)
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in message.dedupe_key)
        (directory / f"{safe}.html").write_text(message.html_body, encoding="utf-8")
        (directory / f"{safe}.txt").write_text(message.text_body, encoding="utf-8")
        logger.info("Saved email preview %s (not sent; MAIL_BACKEND=preview)", safe)
        return DeliveryResult(ok=True, provider_message_id=f"preview:{safe}", previewed=True)


class MailgunBackend:
    name = "mailgun"

    def api_base(self) -> str:
        return "https://api.eu.mailgun.net" if settings.MAILGUN_REGION == "eu" else "https://api.mailgun.net"

    def send(self, message) -> DeliveryResult:
        if not settings.MAILGUN_API_KEY or not settings.MAILGUN_DOMAIN:
            return DeliveryResult(ok=False, error="Mailgun is not configured (MAILGUN_API_KEY / MAILGUN_DOMAIN).")
        data = {
            "from": settings.MAIL_FROM,
            "to": message.to_email,
            "subject": message.subject,
            "text": message.text_body,
            "html": message.html_body,
            "o:tag": message.kind,
            "v:dedupe_key": message.dedupe_key,
        }
        if settings.MAIL_REPLY_TO:
            data["h:Reply-To"] = settings.MAIL_REPLY_TO
        url = f"{self.api_base()}/v3/{settings.MAILGUN_DOMAIN}/messages"
        try:
            response = requests.post(url, auth=("api", settings.MAILGUN_API_KEY), data=data, timeout=settings.MAIL_HTTP_TIMEOUT)
        except requests.RequestException as exc:
            return DeliveryResult(ok=False, error=f"Network error contacting Mailgun: {exc.__class__.__name__}")

        if 200 <= response.status_code < 300:
            try:
                msg_id = response.json().get("id", "")
            except ValueError:
                msg_id = ""
            return DeliveryResult(ok=True, provider_message_id=msg_id, status_code=response.status_code)

        # Keep Mailgun's short reason (e.g. sandbox recipient not authorised) but
        # never log credentials or the full payload.
        try:
            reason = str(response.json().get("message", ""))[:300]
        except ValueError:
            reason = response.text[:300]
        # 400 = bad request; 403 'not allowed to send' = sandbox recipient not
        # authorized. Retrying can't fix either.
        permanent = response.status_code == 400 or (
            response.status_code == 403 and "not allowed" in reason.lower()
        )
        return DeliveryResult(
            ok=False, status_code=response.status_code, error=f"Mailgun {response.status_code}: {reason}", permanent=permanent
        )


def get_backend():
    if settings.MAIL_BACKEND == "mailgun":
        return MailgunBackend()
    return PreviewBackend()
