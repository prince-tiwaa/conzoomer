from rest_framework.authentication import SessionAuthentication


class CsrfEnforcedSessionAuthentication(SessionAuthentication):
    """Session auth that enforces CSRF on unsafe methods for *every* visitor.

    DRF's stock SessionAuthentication only checks CSRF for logged-in users.
    Guests also hold state in their session (their cart), so cart and checkout
    writes must be CSRF-protected for them too.
    """

    def authenticate(self, request):
        user = getattr(request._request, "user", None)
        if user is not None and user.is_active and user.is_authenticated:
            self.enforce_csrf(request)
            return (user, None)
        if request.method not in ("GET", "HEAD", "OPTIONS", "TRACE"):
            self.enforce_csrf(request)
        return None
