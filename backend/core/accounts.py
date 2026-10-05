"""Email + password accounts (website and mobile) and the mobile Google hand-off.

Website  → session cookie (POST /api/auth/register/, /api/auth/login/).
Mobile   → DRF token     (POST /api/mobile/auth/register/, /api/mobile/auth/login/).
Both use the same User rows, so a cart saved for a user on one is the cart the
other sees.
"""

import base64
import hashlib
import html
import logging
import re
import secrets
from datetime import timedelta
from urllib.parse import urlencode

from allauth.account.models import EmailAddress
from django.conf import settings
from django.contrib.auth import get_user_model, login
from django.contrib.auth.models import update_last_login
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.http import HttpResponse, HttpResponseRedirect
from django.middleware.csrf import get_token
from django.utils import timezone
from rest_framework import serializers
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .exceptions import ApiError
from .models import MobileLoginCode, sha256

logger = logging.getLogger(__name__)
User = get_user_model()

SESSION_MOBILE_KEY = "mobile_google"
CHALLENGE_RE = re.compile(r"^[A-Za-z0-9_-]{43,128}$")
STATE_RE = re.compile(r"^[A-Za-z0-9_-]{8,128}$")


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def find_user_by_email(email: str):
    return User.objects.filter(email__iexact=email.strip()).order_by("pk").first()


def user_payload(user):
    from .views import user_payload as payload  # single definition

    return payload(user)


class RegisterSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150, error_messages={"blank": "Enter your name."})
    email = serializers.EmailField(error_messages={"invalid": "Enter a valid email address.", "blank": "Enter your email address."})
    password = serializers.CharField(max_length=128, trim_whitespace=False, error_messages={"blank": "Choose a password."})

    def validate_name(self, value):
        value = " ".join(value.split())
        if len(value) < 2:
            raise serializers.ValidationError("Enter your name.")
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if find_user_by_email(value) or EmailAddress.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists. Sign in instead.")
        return value

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(" ".join(exc.messages))
        return value

    def validate(self, attrs):
        # Second pass with the user's details (e.g. password too similar to email).
        first, _, last = attrs["name"].partition(" ")
        candidate = User(email=attrs["email"], first_name=first, last_name=last)
        try:
            validate_password(attrs["password"], user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": " ".join(exc.messages)})
        return attrs


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField(error_messages={"invalid": "Enter a valid email address.", "blank": "Enter your email address."})
    password = serializers.CharField(max_length=128, trim_whitespace=False, error_messages={"blank": "Enter your password."})


def create_account(data) -> "User":
    first, _, last = data["name"].partition(" ")
    try:
        with transaction.atomic():
            user = User.objects.create_user(
                username=f"u_{secrets.token_hex(8)}",
                email=data["email"],
                password=data["password"],
                first_name=first[:150],
                last_name=last[:150],
            )
            EmailAddress.objects.create(user=user, email=data["email"], primary=True, verified=False)
    except IntegrityError:
        raise ApiError("An account with this email already exists. Sign in instead.", code="email_taken",
                       status_code=409, fields={"email": "An account with this email already exists."})
    logger.info("Created password account %s", user.pk)
    return user


def check_credentials(data) -> "User":
    user = find_user_by_email(data["email"])
    if user is None or not user.is_active:
        # Same message either way so emails can't be probed.
        raise ApiError("That email and password don't match an account.", code="invalid_credentials", status_code=400)
    if not user.has_usable_password():
        raise ApiError(
            "This account uses Google sign-in. Continue with Google instead.",
            code="use_google", status_code=400,
        )
    if not user.check_password(data["password"]):
        raise ApiError("That email and password don't match an account.", code="invalid_credentials", status_code=400)
    return user


def issue_token(user) -> str:
    token, _ = Token.objects.get_or_create(user=user)
    update_last_login(None, user)
    return token.key


# --------------------------------------------------------------------------
# Website (session) endpoints — CSRF-protected like every other web write
# --------------------------------------------------------------------------

class WebRegisterView(APIView):
    throttle_scope = "auth"

    def post(self, request):
        s = RegisterSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = create_account(s.validated_data)
        login(request._request, user, backend="django.contrib.auth.backends.ModelBackend")
        return Response({"user": user_payload(user)}, status=201)


class WebLoginView(APIView):
    throttle_scope = "auth"

    def post(self, request):
        s = LoginSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = check_credentials(s.validated_data)
        login(request._request, user, backend="django.contrib.auth.backends.ModelBackend")
        return Response({"user": user_payload(user)})


# --------------------------------------------------------------------------
# Mobile (token) endpoints — no cookies, so no CSRF
# --------------------------------------------------------------------------

class MobileRegisterView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "auth"

    def post(self, request):
        s = RegisterSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = create_account(s.validated_data)
        return Response({"token": issue_token(user), "user": user_payload(user)}, status=201)


class MobileLoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "auth"

    def post(self, request):
        s = LoginSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = check_credentials(s.validated_data)
        return Response({"token": issue_token(user), "user": user_payload(user)})


class MobileLogoutView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_scope = "auth"

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response({"ok": True})


# --------------------------------------------------------------------------
# Mobile Google sign-in (system browser → one-time code → token)
# --------------------------------------------------------------------------

class AppRedirect(HttpResponseRedirect):
    """HttpResponseRedirect that also allows the app's custom URL schemes."""

    allowed_schemes = ["http", "https", *settings.MOBILE_REDIRECT_SCHEMES]


def valid_app_redirect(uri: str) -> bool:
    if not uri or len(uri) > 300 or any(c in uri for c in "\r\n\"'<> "):
        return False
    scheme = uri.split("://", 1)[0].lower() if "://" in uri else ""
    return scheme in settings.MOBILE_REDIRECT_SCHEMES


def back_to_app(flow: dict, **params) -> HttpResponseRedirect:
    query = urlencode({**params, "state": flow.get("state", "")})
    sep = "&" if "?" in flow["redirect_uri"] else "?"
    return AppRedirect(f"{flow['redirect_uri']}{sep}{query}")


def mobile_flow_redirect(request, error: str):
    """Used by the social adapter: if a Google sign-in started from the app
    fails, send the shopper back to the app instead of the website."""
    session = getattr(request, "session", None)
    flow = session.pop(SESSION_MOBILE_KEY, None) if session is not None else None
    if flow and valid_app_redirect(flow.get("redirect_uri", "")):
        return back_to_app(flow, error=error)
    return None


def mobile_google_start(request):
    """GET /api/mobile/google/start/?redirect_uri=conzoomer://auth&code_challenge=…&state=…

    Opened by the app in the system browser. Remembers where to return, then
    auto-submits allauth's CSRF-protected POST that begins Google OAuth."""
    redirect_uri = request.GET.get("redirect_uri", "")
    challenge = request.GET.get("code_challenge", "")
    state = request.GET.get("state", "")
    if not valid_app_redirect(redirect_uri) or not CHALLENGE_RE.fullmatch(challenge) or not STATE_RE.fullmatch(state):
        return HttpResponse("Invalid sign-in request.", status=400, content_type="text/plain")
    if not settings.GOOGLE_AUTH_CONFIGURED:
        return AppRedirect(f"{redirect_uri}?{urlencode({'error': 'google_not_configured', 'state': state})}")

    request.session[SESSION_MOBILE_KEY] = {"redirect_uri": redirect_uri, "challenge": challenge, "state": state}
    token = html.escape(get_token(request))
    body = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Continuing to Google · Conzoomer</title>
<style>body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#F6F2EA;color:#151515;font:16px/1.5 system-ui,sans-serif}}
main{{text-align:center;padding:24px}}b{{font:700 26px Georgia,serif}}b span{{color:#1C3FD1}}
button{{margin-top:16px;font:inherit;font-weight:600;background:#1C3FD1;color:#fff;border:0;border-radius:999px;padding:12px 22px}}</style></head>
<body><main><b>conzoomer<span>.</span></b><p>Taking you to Google…</p>
<form id="f" method="post" action="/accounts/google/login/">
<input type="hidden" name="csrfmiddlewaretoken" value="{token}">
<input type="hidden" name="process" value="login">
<input type="hidden" name="next" value="/api/mobile/google/finish/">
<noscript><button type="submit">Continue with Google</button></noscript>
</form><script>document.getElementById("f").submit();</script></main></body></html>"""
    response = HttpResponse(body, content_type="text/html; charset=utf-8")
    response["Cache-Control"] = "no-store"
    return response


def mobile_google_finish(request):
    """allauth sends the browser here after a successful Google sign-in."""
    flow = request.session.pop(SESSION_MOBILE_KEY, None)
    if not flow or not valid_app_redirect(flow.get("redirect_uri", "")):
        return HttpResponseRedirect("/account")
    if not request.user.is_authenticated:
        return back_to_app(flow, error="not_signed_in")
    code = secrets.token_urlsafe(32)
    MobileLoginCode.objects.create(
        code_hash=sha256(code),
        user=request.user,
        code_challenge=flow["challenge"],
        expires_at=timezone.now() + timedelta(seconds=settings.MOBILE_LOGIN_CODE_TTL_SECONDS),
    )
    return back_to_app(flow, code=code)


def pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


class MobileGoogleExchangeView(APIView):
    """POST {code, code_verifier} → {token, user}. Each code works once."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "auth"

    def post(self, request):
        code = str(request.data.get("code") or "")
        verifier = str(request.data.get("code_verifier") or "")
        invalid = ApiError("This sign-in link has expired. Please try again.", code="invalid_code", status_code=400)
        if not code or not CHALLENGE_RE.fullmatch(verifier):
            raise invalid
        with transaction.atomic():
            row = (
                MobileLoginCode.objects.select_for_update()
                .select_related("user")
                .filter(code_hash=sha256(code), used_at__isnull=True, expires_at__gt=timezone.now())
                .first()
            )
            if row is None or not secrets.compare_digest(pkce_challenge(verifier), row.code_challenge):
                raise invalid
            row.used_at = timezone.now()
            row.save(update_fields=["used_at"])
        if not row.user.is_active:
            raise invalid
        return Response({"token": issue_token(row.user), "user": user_payload(row.user)})
