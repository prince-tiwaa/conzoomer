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
        """Send shoppers back to the branded sign-in page instead of allauth's
        default template when they cancel or Google returns an error."""
        reason = "cancelled" if error == AuthError.CANCELLED else "provider"
        raise ImmediateHttpResponse(HttpResponseRedirect("/signin?" + urlencode({"error": reason})))

    def is_open_for_signup(self, request, sociallogin):
        return True

    def populate_user(self, request, sociallogin, data):
        user = super().populate_user(request, sociallogin, data)
        if not user.first_name and data.get("name"):
            user.first_name = data["name"][:150]
        return user


def google_configured() -> bool:
    return settings.GOOGLE_AUTH_CONFIGURED
