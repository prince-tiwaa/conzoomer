from django.contrib import admin
from django.urls import include, path

from cart import views as cart_views
from catalog import views as catalog_views
from core import accounts as account_views
from core import views as core_views
from orders import views as order_views

admin.site.site_header = "Conzoomer admin"
admin.site.site_title = "Conzoomer admin"
admin.site.index_title = "Store management"

api = [
    path("health", core_views.health),
    path("session/", core_views.SessionView.as_view()),
    path("auth/logout/", core_views.LogoutView.as_view()),
    path("auth/dev-login/", core_views.DevLoginView.as_view()),
    path("auth/register/", account_views.WebRegisterView.as_view()),
    path("auth/login/", account_views.WebLoginView.as_view()),
    # Mobile app (token auth)
    path("mobile/auth/register/", account_views.MobileRegisterView.as_view()),
    path("mobile/auth/login/", account_views.MobileLoginView.as_view()),
    path("mobile/auth/logout/", account_views.MobileLogoutView.as_view()),
    path("mobile/google/start/", account_views.mobile_google_start),
    path("mobile/google/finish/", account_views.mobile_google_finish),
    path("mobile/google/exchange/", account_views.MobileGoogleExchangeView.as_view()),
    path("categories/", catalog_views.CategoryListView.as_view()),
    path("products/", catalog_views.ProductListView.as_view()),
    path("products/<slug:slug>/", catalog_views.ProductDetailView.as_view()),
    path("cart/", cart_views.CartView.as_view()),
    path("cart/items/", cart_views.CartItemsView.as_view()),
    path("cart/items/<int:item_id>/", cart_views.CartItemDetailView.as_view()),
    path("checkout/config/", order_views.CheckoutConfigView.as_view()),
    path("checkout/quote/", order_views.CheckoutQuoteView.as_view()),
    path("checkout/", order_views.CheckoutView.as_view()),
    path("orders/<str:reference>/", order_views.OrderLookupView.as_view()),
    path("orders/<str:reference>/email-preview/", order_views.OrderEmailPreviewView.as_view()),
    path("account/", core_views.AccountView.as_view()),
    path("account/orders/", order_views.AccountOrdersView.as_view()),
    path("account/orders/<str:reference>/", order_views.AccountOrderDetailView.as_view()),
]

urlpatterns = [
    path("", core_views.root),
    path("admin/", admin.site.urls),
    path("api/", include(api)),
    # The storefront owns the sign-in UI; allauth's own pages redirect there.
    path("accounts/login/", core_views.redirect_to_signin),
    path("accounts/signup/", core_views.redirect_to_signin),
    path("accounts/", include("allauth.urls")),
]

handler404 = "core.errors.not_found"
handler500 = "core.errors.server_error"
