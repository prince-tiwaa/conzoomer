from django.conf import settings
from django.contrib.auth import get_user_model, login, logout
from django.db import connection
from django.http import HttpResponseRedirect, JsonResponse
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from cart.services import get_cart

from .exceptions import ApiError


def user_payload(user):
    if not user.is_authenticated:
        return None
    social = user.socialaccount_set.first() if hasattr(user, "socialaccount_set") else None
    picture = social.extra_data.get("picture") if social else None
    return {
        "id": user.pk,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "name": user.get_full_name() or user.email,
        "picture": picture,
        "provider": social.provider if social else None,
        "date_joined": user.date_joined,
    }


@method_decorator(ensure_csrf_cookie, name="dispatch")
class SessionView(APIView):
    """Bootstraps the storefront: who is signed in, cart count, feature flags.
    Also guarantees the CSRF cookie is set."""

    throttle_scope = "catalog"

    def get(self, request):
        cart = get_cart(request)
        count = sum(cart.items.values_list("quantity", flat=True)) if cart else 0
        return Response({
            "user": user_payload(request.user),
            "cart_count": count,
            "google_enabled": settings.GOOGLE_AUTH_CONFIGURED,
            "dev_login_enabled": settings.DEV_LOGIN_ENABLED,
            "currency": settings.CURRENCY_CODE,
            "mail_backend": settings.MAIL_BACKEND,
        })


class LogoutView(APIView):
    throttle_scope = "auth"

    def post(self, request):
        logout(request)
        return Response({"ok": True})


class DevLoginView(APIView):
    """LOCAL DEVELOPMENT ONLY: signs in a fixed demo shopper so account pages
    can be demonstrated before Google OAuth credentials exist. Disabled unless
    DJANGO_DEBUG=true and DEV_LOGIN_ENABLED=true."""

    throttle_scope = "auth"

    def post(self, request):
        if not settings.DEV_LOGIN_ENABLED:
            raise ApiError("Not available.", code="not_found", status_code=404)
        User = get_user_model()
        user, _ = User.objects.get_or_create(
            username="demo-shopper",
            defaults={"email": "demo.shopper@example.com", "first_name": "Demo", "last_name": "Shopper"},
        )
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        return Response({"user": user_payload(user)})


class AccountView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_scope = "auth"

    def get(self, request):
        return Response({"user": user_payload(request.user)})


def health(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        db = "ok"
    except Exception:
        db = "error"
    return JsonResponse({"status": "ok" if db == "ok" else "degraded", "database": db}, status=200 if db == "ok" else 503)


def redirect_to_signin(request):
    return HttpResponseRedirect("/signin")


def root(request):
    """The API host has no pages of its own; send visitors to the storefront."""
    return HttpResponseRedirect(settings.FRONTEND_URL + "/")
