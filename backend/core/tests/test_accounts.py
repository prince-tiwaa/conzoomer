import base64
import hashlib
import secrets
from urllib.parse import parse_qs, urlparse

from allauth.account.models import EmailAddress
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from cart.models import Cart
from core.accounts import mobile_google_finish
from core.models import MobileLoginCode

from .helpers import csrf_client, make_product, make_user

User = get_user_model()
GOOD = {"name": "Ada Lovelace", "email": "Ada@Example.com", "password": "correct-horse-42"}


def mobile_client(token=None):
    c = APIClient(enforce_csrf_checks=True)
    if token:
        c.credentials(HTTP_AUTHORIZATION=f"Token {token}")
    return c


class WebAccountTests(TestCase):
    def test_register_signs_in_with_session(self):
        c = csrf_client()
        r = c.post("/api/auth/register/", GOOD, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["user"]["email"], "ada@example.com")
        self.assertEqual(r.json()["user"]["provider"], "email")
        self.assertEqual(c.get("/api/session/").json()["user"]["email"], "ada@example.com")
        self.assertTrue(EmailAddress.objects.filter(email="ada@example.com").exists())

    def test_register_validation(self):
        c = csrf_client()
        r = c.post("/api/auth/register/", {"name": "A", "email": "nope", "password": "123"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(set(r.json()["error"]["fields"]), {"name", "email", "password"})
        c.post("/api/auth/register/", GOOD, format="json")
        r = csrf_client().post("/api/auth/register/", {**GOOD, "email": "ADA@example.com"}, format="json")
        self.assertIn("already exists", r.json()["error"]["fields"]["email"])

    def test_login_and_wrong_password(self):
        csrf_client().post("/api/auth/register/", GOOD, format="json")
        c = csrf_client()
        r = c.post("/api/auth/login/", {"email": "ada@EXAMPLE.com", "password": "wrong-pass-1"}, format="json")
        self.assertEqual(r.json()["error"]["code"], "invalid_credentials")
        r = c.post("/api/auth/login/", {"email": "ada@example.com", "password": GOOD["password"]}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertIsNotNone(c.get("/api/session/").json()["user"])

    def test_google_only_account_is_told_to_use_google(self):
        make_user("g@example.com")  # unusable password, like a Google sign-up
        r = csrf_client().post("/api/auth/login/", {"email": "g@example.com", "password": "whatever-123"}, format="json")
        self.assertEqual(r.json()["error"]["code"], "use_google")

    def test_web_login_requires_csrf(self):
        naked = APIClient(enforce_csrf_checks=True)
        r = naked.post("/api/auth/login/", {"email": "a@b.co", "password": "x"}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_guest_cart_merges_on_password_login(self):
        csrf_client().post("/api/auth/register/", GOOD, format="json")
        p = make_product("Lamp", stock=5)
        c = csrf_client()
        c.post("/api/cart/items/", {"product_id": p.pk, "quantity": 2}, format="json")
        c.post("/api/auth/login/", {"email": GOOD["email"], "password": GOOD["password"]}, format="json")
        user = User.objects.get(email="ada@example.com")
        self.assertEqual(Cart.objects.get(user=user).items.get().quantity, 2)


class MobileAccountTests(TestCase):
    def test_mobile_register_and_login_issue_tokens_without_csrf(self):
        r = mobile_client().post("/api/mobile/auth/register/", GOOD, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        token = r.json()["token"]
        r = mobile_client().post("/api/mobile/auth/login/", {"email": GOOD["email"], "password": GOOD["password"]}, format="json")
        self.assertEqual(r.json()["token"], token)
        me = mobile_client(token).get("/api/account/")
        self.assertEqual(me.json()["user"]["email"], "ada@example.com")

    def test_bad_token_is_rejected(self):
        r = mobile_client("not-a-real-token").get("/api/cart/")
        self.assertEqual(r.status_code, 401)

    def test_logout_revokes_token(self):
        token = mobile_client().post("/api/mobile/auth/register/", GOOD, format="json").json()["token"]
        mobile_client(token).post("/api/mobile/auth/logout/")
        self.assertFalse(Token.objects.exists())
        self.assertEqual(mobile_client(token).get("/api/account/").status_code, 401)


class CartSyncTests(TestCase):
    """The assignment's demo: same account, one cart, both directions."""

    def test_web_and_mobile_share_one_cart(self):
        lamp = make_product("Lamp", "40.00", stock=10)
        mug = make_product("Mug", "10.00", stock=10)

        # Web: create account and add a lamp.
        web = csrf_client()
        web.post("/api/auth/register/", GOOD, format="json")
        # Django rotates the CSRF token at login; the website re-reads the cookie.
        web.credentials(HTTP_X_CSRFTOKEN=web.cookies["csrftoken"].value)
        self.assertEqual(web.post("/api/cart/items/", {"product_id": lamp.pk, "quantity": 1}, format="json").status_code, 201)

        # Mobile: sign in with the same credentials and see the lamp.
        token = mobile_client().post("/api/mobile/auth/login/", {"email": GOOD["email"], "password": GOOD["password"]}, format="json").json()["token"]
        phone = mobile_client(token)
        names = [i["product"]["name"] for i in phone.get("/api/cart/").json()["items"]]
        self.assertEqual(names, ["Lamp"])

        # Mobile: add a mug (no CSRF needed with a token).
        r = phone.post("/api/cart/items/", {"product_id": mug.pk, "quantity": 2}, format="json")
        self.assertEqual(r.status_code, 201, r.content)

        # Web: both items are there.
        cart = web.get("/api/cart/").json()
        self.assertEqual(sorted(i["product"]["name"] for i in cart["items"]), ["Lamp", "Mug"])
        self.assertEqual(cart["item_count"], 3)
        self.assertEqual(Cart.objects.count(), 1)

    def test_mobile_can_check_out(self):
        p = make_product("Lamp", "40.00", stock=10)
        token = mobile_client().post("/api/mobile/auth/register/", GOOD, format="json").json()["token"]
        phone = mobile_client(token)
        phone.post("/api/cart/items/", {"product_id": p.pk, "quantity": 1}, format="json")
        r = phone.post(
            "/api/checkout/",
            {"email": "ada@example.com", "shipping_method": "standard", "shipping_address": {
                "full_name": "Ada Lovelace", "line1": "1 Main St", "city": "Austin", "region": "TX",
                "postal_code": "78701", "country": "US"}},
            format="json", HTTP_IDEMPOTENCY_KEY=secrets.token_hex(16),
        )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(phone.get("/api/account/orders/").json()["count"], 1)


def pkce_pair():
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return verifier, challenge


@override_settings(GOOGLE_AUTH_CONFIGURED=True)
class MobileGoogleHandoffTests(TestCase):
    def start(self, client, redirect="conzoomer://auth", challenge=None, state="state123abc"):
        return client.get("/api/mobile/google/start/", {"redirect_uri": redirect, "code_challenge": challenge, "state": state})

    def test_start_rejects_foreign_redirects(self):
        _, challenge = pkce_pair()
        c = APIClient()
        self.assertEqual(self.start(c, "https://evil.example/cb", challenge).status_code, 400)
        self.assertEqual(self.start(c, "javascript://x", challenge).status_code, 400)
        self.assertEqual(self.start(c, "conzoomer://auth", "short").status_code, 400)

    def test_full_handoff(self):
        verifier, challenge = pkce_pair()
        c = APIClient()
        r = self.start(c, challenge=challenge)
        self.assertEqual(r.status_code, 200)
        self.assertIn(b'action="/accounts/google/login/"', r.content)
        self.assertIn(b'value="/api/mobile/google/finish/"', r.content)

        # Pretend Google sign-in succeeded in this browser session.
        user = make_user("g@example.com")
        c.force_login(user)
        r = c.get("/api/mobile/google/finish/")
        self.assertEqual(r.status_code, 302)
        loc = urlparse(r["Location"])
        self.assertEqual(f"{loc.scheme}://{loc.netloc}", "conzoomer://auth")
        q = parse_qs(loc.query)
        self.assertEqual(q["state"], ["state123abc"])
        code = q["code"][0]

        # Wrong verifier fails; right one gives a token; reuse fails.
        bad = mobile_client().post("/api/mobile/google/exchange/", {"code": code, "code_verifier": pkce_pair()[0]}, format="json")
        self.assertEqual(bad.status_code, 400)
        ok = mobile_client().post("/api/mobile/google/exchange/", {"code": code, "code_verifier": verifier}, format="json")
        self.assertEqual(ok.status_code, 200, ok.content)
        self.assertEqual(ok.json()["user"]["email"], "g@example.com")
        again = mobile_client().post("/api/mobile/google/exchange/", {"code": code, "code_verifier": verifier}, format="json")
        self.assertEqual(again.status_code, 400)
        self.assertEqual(MobileLoginCode.objects.get().used_at is not None, True)
