from decimal import Decimal, InvalidOperation

from django.core.paginator import EmptyPage, Paginator
from django.db.models import Count, Max, Min, Q
from django.shortcuts import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from core.exceptions import ApiError
from core.money import money_str

from .models import Category, Product
from .serializers import CategorySerializer, ProductCardSerializer, ProductDetailSerializer

SORTS = {
    "featured": ["-is_featured", "-created_at", "id"],
    "newest": ["-created_at", "id"],
    "price_asc": ["price", "id"],
    "price_desc": ["-price", "id"],
}
PAGE_SIZE = 12


def active_products():
    return Product.objects.filter(is_active=True).select_related("category").prefetch_related("images")


def _parse_price(value, name):
    if value in (None, ""):
        return None
    try:
        price = Decimal(value)
    except (InvalidOperation, ValueError):
        raise ApiError(f"{name} must be a number.", code="invalid_filter", fields={name: "Enter a valid amount."})
    if price < 0 or not price.is_finite():
        raise ApiError(f"{name} must be zero or more.", code="invalid_filter", fields={name: "Enter a positive amount."})
    return price


class CategoryListView(APIView):
    throttle_scope = "catalog"

    def get(self, request):
        categories = Category.objects.annotate(
            product_count=Count("products", filter=Q(products__is_active=True))
        )
        return Response({"results": CategorySerializer(categories, many=True).data})


class ProductListView(APIView):
    """GET /api/products/?q=&category=&min_price=&max_price=&sort=&page=&in_stock=1"""

    throttle_scope = "catalog"

    def get(self, request):
        params = request.query_params
        qs = active_products()

        q = (params.get("q") or "").strip()[:100]
        if q:
            for term in q.split():
                qs = qs.filter(
                    Q(name__icontains=term) | Q(short_description__icontains=term) | Q(description__icontains=term)
                )

        category_slug = (params.get("category") or "").strip()
        category = None
        if category_slug:
            category = Category.objects.filter(slug=category_slug).first()
            if category is None:
                raise ApiError("That category doesn't exist.", code="unknown_category", status_code=404)
            qs = qs.filter(category=category)

        min_price = _parse_price(params.get("min_price"), "min_price")
        max_price = _parse_price(params.get("max_price"), "max_price")
        if min_price is not None and max_price is not None and min_price > max_price:
            raise ApiError("Minimum price can't be higher than maximum price.", code="invalid_filter")
        if min_price is not None:
            qs = qs.filter(price__gte=min_price)
        if max_price is not None:
            qs = qs.filter(price__lte=max_price)

        if params.get("in_stock") in ("1", "true"):
            qs = qs.filter(stock__gt=0)

        if params.get("featured") in ("1", "true"):
            qs = qs.filter(is_featured=True)

        sort = params.get("sort") or "featured"
        if sort not in SORTS:
            raise ApiError("Unknown sort option.", code="invalid_filter", fields={"sort": f"Use one of: {', '.join(SORTS)}."})
        qs = qs.order_by(*SORTS[sort])

        try:
            page_size = max(1, min(int(params.get("page_size") or PAGE_SIZE), 48))
            page_number = max(1, int(params.get("page") or 1))
        except ValueError:
            raise ApiError("Page must be a whole number.", code="invalid_filter")

        paginator = Paginator(qs, page_size)
        try:
            page = paginator.page(page_number)
        except EmptyPage:
            page = None

        bounds = Product.objects.filter(is_active=True).aggregate(lo=Min("price"), hi=Max("price"))
        return Response(
            {
                "count": paginator.count,
                "page": page_number,
                "page_size": page_size,
                "num_pages": paginator.num_pages,
                "results": ProductCardSerializer(page.object_list if page else [], many=True).data,
                "category": CategorySerializer(category).data if category else None,
                "price_bounds": {
                    "min": money_str(bounds["lo"]) if bounds["lo"] is not None else None,
                    "max": money_str(bounds["hi"]) if bounds["hi"] is not None else None,
                },
            }
        )


class ProductDetailView(APIView):
    throttle_scope = "catalog"

    def get(self, request, slug):
        product = get_object_or_404(active_products(), slug=slug)
        related = list(
            active_products().filter(category=product.category).exclude(pk=product.pk).order_by("-is_featured", "-created_at")[:4]
        )
        if len(related) < 4:
            related += list(
                active_products()
                .exclude(pk=product.pk)
                .exclude(pk__in=[p.pk for p in related])
                .filter(is_featured=True)[: 4 - len(related)]
            )
        return Response(
            {
                "product": ProductDetailSerializer(product).data,
                "related": ProductCardSerializer(related, many=True).data,
            }
        )
