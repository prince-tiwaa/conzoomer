from django.conf import settings


class PublicHostMiddleware:
    """Optional: force the public storefront host for absolute URLs.

    Normally the proxy in front of Django (Next.js, Vercel) sends the original
    host in X-Forwarded-Host. If a platform doesn't, set DJANGO_PUBLIC_HOST
    (e.g. conzoomer.vercel.app) so OAuth callback URLs still use it.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self.host = settings.PUBLIC_HOST

    def __call__(self, request):
        if self.host:
            request.META["HTTP_X_FORWARDED_HOST"] = self.host
        return self.get_response(request)
