from urllib.parse import urlencode

from allauth.account.adapter import DefaultAccountAdapter
from allauth.core.exceptions import ImmediateHttpResponse
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from allauth.socialaccount.providers.base.constants import AuthError
from django.conf import settings
from django.http import HttpResponseRedirect
from django.utils.http import url_has_allowed_host_and_scheme


class AccountAdapter(DefaultAccountAdapter):
    def is_safe_url(self, url):
        # Only same-origin relative paths are allowed as post-login targets.
        return bool(url) and url.startswith("/") and not url.startswith("//") and url_has_allowed_host_and_scheme(
            url, allowed_hosts=None
        )


class SocialAccountAdapter(DefaultSocialAccountAdapter):
    def on_authentication_error(self, request, provider, error=None, exception=None, extra_context=None):
        """Send shoppers back to the branded sign-in page (or to the mobile app,
        if that's where they started) instead of allauth's default template."""
        from .accounts import mobile_flow_redirect

        reason = "cancelled" if error == AuthError.CANCELLED else "provider"
        raise ImmediateHttpResponse(
            mobile_flow_redirect(request, reason) or HttpResponseRedirect("/signin?" + urlencode({"error": reason}))
        )

    def pre_social_login(self, request, sociallogin):
        """A Google sign-in whose email already belongs to an email+password
        account is not linked automatically (that could hand an account to
        whoever registered the address first). Ask the shopper to use their
        password instead."""
        from .accounts import find_user_by_email, mobile_flow_redirect

        if sociallogin.is_existing:
            return
        email = (sociallogin.user.email or "").strip()
        if email and find_user_by_email(email):
            raise ImmediateHttpResponse(
                mobile_flow_redirect(request, "email_exists")
                or HttpResponseRedirect("/signin?" + urlencode({"error": "email_exists"}))
            )

    def is_open_for_signup(self, request, sociallogin):
        return True

    def populate_user(self, request, sociallogin, data):
        user = super().populate_user(request, sociallogin, data)
        if not user.first_name and data.get("name"):
            user.first_name = data["name"][:150]
        return user


def google_configured() -> bool:
    return settings.GOOGLE_AUTH_CONFIGURED
