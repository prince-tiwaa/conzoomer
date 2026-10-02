from django.contrib.auth.signals import user_logged_in
from django.dispatch import receiver

from .services import merge_guest_cart_into_user


@receiver(user_logged_in)
def merge_cart_on_login(sender, request, user, **kwargs):
    if request is not None and hasattr(request, "session"):
        merge_guest_cart_into_user(request, user)
