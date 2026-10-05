import hashlib

from django.conf import settings
from django.db import models


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


class MobileLoginCode(models.Model):
    """One-time code handed back to the mobile app after Google sign-in in the
    system browser. It is useless without the PKCE verifier the app kept, and
    it expires after a few minutes."""

    code_hash = models.CharField(max_length=64, unique=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    code_challenge = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["expires_at"])]

    def __str__(self):
        return f"Mobile login code for user {self.user_id}"
