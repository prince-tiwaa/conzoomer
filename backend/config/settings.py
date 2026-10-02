"""
Django settings for Conzoomer.

Every secret and environment-specific value is read from environment variables
(see ../.env.example). Nothing sensitive is hard-coded here.
"""

from decimal import Decimal
from pathlib import Path
import os

import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
# Load backend/.env first, then the repo-root .env (first value wins).
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR.parent / ".env")


def env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    return value if value not in (None, "") else default


def env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    raw = env(name, default) or ""
    return [item.strip() for item in raw.split(",") if item.strip()]


DEBUG = env_bool("DJANGO_DEBUG", False)

SECRET_KEY = env("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = "dev-only-insecure-key-change-me"
    else:
        raise RuntimeError("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is false.")

# The public origin customers use (the Next.js storefront). Used to build links
# in emails and post-login redirects.
FRONTEND_URL = (env("FRONTEND_URL", "http://localhost:3000") or "").rstrip("/")

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", FRONTEND_URL)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "allauth.socialaccount.providers.google",
    "core",
    "catalog",
    "cart",
    "orders",
    "notifications",
]

MIDDLEWARE = [
    "core.middleware.PublicHostMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "allauth.account.middleware.AccountMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# --- Database ---------------------------------------------------------------
# PostgreSQL (Neon or Supabase) via DATABASE_URL. sslmode=require is honoured
# from the URL. conn_max_age keeps connections warm; health checks recover
# from Neon's idle-connection drops.
DATABASE_URL = env("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Copy .env.example to .env and add your Neon/Supabase "
        "PostgreSQL connection string."
    )
DATABASES = {
    "default": dj_database_url.parse(
        DATABASE_URL,
        conn_max_age=int(env("DB_CONN_MAX_AGE", "60") or 60),
        conn_health_checks=True,
    )
}
if DATABASES["default"]["ENGINE"] != "django.db.backends.postgresql":
    raise RuntimeError("Conzoomer requires PostgreSQL (DATABASE_URL must start with postgres://).")

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": (
            "django.contrib.staticfiles.storage.StaticFilesStorage"
            if DEBUG
            else "whitenoise.storage.CompressedManifestStaticFilesStorage"
        )
    },
}

# --- Sessions, cookies, CSRF -------------------------------------------------
# The storefront and API share one origin (Next.js proxies /api, /accounts and
# /admin to Django), so first-party Lax cookies work without CORS.
SESSION_COOKIE_NAME = "cz_session"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = 60 * 60 * 24 * 30  # 30 days, keeps guest carts alive
CSRF_COOKIE_NAME = "csrftoken"
CSRF_COOKIE_HTTPONLY = False  # the SPA reads it and sends X-CSRFToken
CSRF_COOKIE_SAMESITE = "Lax"

# Behind the Next.js proxy (and most PaaS load balancers) the original host and
# scheme arrive in X-Forwarded-* headers. Needed so OAuth callback URLs use the
# public origin rather than 127.0.0.1:8000.
USE_X_FORWARDED_HOST = env_bool("DJANGO_USE_X_FORWARDED_HOST", True)
PUBLIC_HOST = env("DJANGO_PUBLIC_HOST", "")
if env_bool("DJANGO_TRUST_X_FORWARDED_PROTO", not DEBUG):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", True)
    SECURE_REDIRECT_EXEMPT = [r"^api/health$"]
    SECURE_HSTS_SECONDS = int(env("DJANGO_HSTS_SECONDS", "2592000") or 0)
    SECURE_HSTS_INCLUDE_SUBDOMAINS = False
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
    X_FRAME_OPTIONS = "DENY"

# --- Django REST Framework ---------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["core.auth.CsrfEnforcedSessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "EXCEPTION_HANDLER": "core.exceptions.api_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {
        "catalog": env("THROTTLE_CATALOG", "300/min"),
        "cart": env("THROTTLE_CART", "120/min"),
        "checkout": env("THROTTLE_CHECKOUT", "10/min"),
        "order_lookup": env("THROTTLE_ORDER_LOOKUP", "30/min"),
        "auth": env("THROTTLE_AUTH", "20/min"),
    },
}
if DEBUG:
    REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"].append("rest_framework.renderers.BrowsableAPIRenderer")

CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
TESTING = len(__import__("sys").argv) > 1 and __import__("sys").argv[1] == "test"
if TESTING:
    # Rate limits would leak between tests through the shared cache; the
    # throttle test opts back in explicitly.
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.dummy.DummyCache"}}

# --- Authentication (django-allauth + Google) ---------------------------------
SITE_ID = 1
LOGIN_URL = "/signin"
LOGIN_REDIRECT_URL = "/account"
ACCOUNT_LOGOUT_REDIRECT_URL = "/"
ACCOUNT_LOGIN_METHODS = {"email"}
ACCOUNT_SIGNUP_FIELDS = ["email*"]
ACCOUNT_EMAIL_VERIFICATION = "none"  # Google has already verified the address
ACCOUNT_UNIQUE_EMAIL = True
ACCOUNT_ADAPTER = "core.adapters.AccountAdapter"
SOCIALACCOUNT_ADAPTER = "core.adapters.SocialAccountAdapter"
SOCIALACCOUNT_AUTO_SIGNUP = True
SOCIALACCOUNT_LOGIN_ON_GET = False  # login must be started with a CSRF-protected POST
SOCIALACCOUNT_STORE_TOKENS = False  # we never call Google APIs, so don't keep tokens
SOCIALACCOUNT_EMAIL_AUTHENTICATION = False  # never auto-link to existing accounts by email
SOCIALACCOUNT_ONLY = True  # no local passwords for shoppers; staff use /admin
SOCIALACCOUNT_PROVIDERS = {
    "google": {
        "SCOPE": ["profile", "email"],
        "AUTH_PARAMS": {"prompt": "select_account"},
        "OAUTH_PKCE_ENABLED": True,
        "EMAIL_AUTHENTICATION": False,
        "APPS": (
            [
                {
                    "client_id": env("GOOGLE_OAUTH_CLIENT_ID"),
                    "secret": env("GOOGLE_OAUTH_CLIENT_SECRET"),
                    "key": "",
                }
            ]
            if env("GOOGLE_OAUTH_CLIENT_ID") and env("GOOGLE_OAUTH_CLIENT_SECRET")
            else []
        ),
    }
}
GOOGLE_AUTH_CONFIGURED = bool(env("GOOGLE_OAUTH_CLIENT_ID") and env("GOOGLE_OAUTH_CLIENT_SECRET"))

# Local-only shortcut that signs in a fixed demo shopper so order history can be
# shown before Google credentials exist. Refuses to run unless DEBUG is on.
DEV_LOGIN_ENABLED = DEBUG and env_bool("DEV_LOGIN_ENABLED", False)

# --- Commerce rules (demo values; NOT production tax advice) --------------------
CURRENCY_CODE = (env("CURRENCY_CODE", "USD") or "USD").upper()
DEMO_TAX_RATE = Decimal(env("DEMO_TAX_RATE", "0.08") or "0")
TAX_LABEL = env("TAX_LABEL", "Estimated sales tax")
FREE_SHIPPING_THRESHOLD = Decimal(env("FREE_SHIPPING_THRESHOLD", "75.00") or "0")
SHIPPING_METHODS = {
    "standard": {
        "label": "Standard",
        "description": "3–5 business days",
        "price": Decimal(env("SHIPPING_STANDARD_PRICE", "6.00") or "0"),
        "free_over_threshold": True,
    },
    "express": {
        "label": "Express",
        "description": "1–2 business days",
        "price": Decimal(env("SHIPPING_EXPRESS_PRICE", "15.00") or "0"),
        "free_over_threshold": False,
    },
}
MAX_QUANTITY_PER_ITEM = int(env("MAX_QUANTITY_PER_ITEM", "10") or 10)

# --- Transactional email -------------------------------------------------------
# MAIL_BACKEND: "preview" (default; saves rendered emails locally, sends nothing)
#               "mailgun" (real delivery through the Mailgun HTTP API)
MAIL_BACKEND = (env("MAIL_BACKEND", "preview") or "preview").lower()
MAILGUN_API_KEY = env("MAILGUN_API_KEY")
MAILGUN_DOMAIN = env("MAILGUN_DOMAIN")
MAILGUN_REGION = (env("MAILGUN_REGION", "us") or "us").lower()  # "us" or "eu"
MAIL_FROM = env("MAIL_FROM", "Conzoomer <orders@example.com>")
MAIL_REPLY_TO = env("MAIL_REPLY_TO")
MAIL_SEND_ON_COMMIT = env_bool("MAIL_SEND_ON_COMMIT", True)
MAIL_MAX_ATTEMPTS = int(env("MAIL_MAX_ATTEMPTS", "6") or 6)
MAIL_HTTP_TIMEOUT = float(env("MAIL_HTTP_TIMEOUT", "8") or 8)
EMAIL_PREVIEW_DIR = BASE_DIR / "var" / "email-previews"
SUPPORT_EMAIL = env("SUPPORT_EMAIL", "hello@conzoomer.example")

# --- Logging -------------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"simple": {"format": "%(asctime)s %(levelname)s %(name)s: %(message)s"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "simple"}},
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", "INFO")},
    "loggers": {
        "django.db.backends": {"level": "WARNING"},
        # requests/urllib3 can log full URLs; keep them quiet.
        "urllib3": {"level": "WARNING"},
    },
}
