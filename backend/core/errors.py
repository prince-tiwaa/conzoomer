from django.http import JsonResponse
from django.shortcuts import render


def _wants_json(request):
    return request.path.startswith("/api/") or "application/json" in request.headers.get("Accept", "")


def not_found(request, exception=None):
    if _wants_json(request):
        return JsonResponse({"error": {"code": "not_found", "message": "Not found."}}, status=404)
    return render(request, "errors/404.html", status=404)


def server_error(request):
    if _wants_json(request):
        return JsonResponse({"error": {"code": "server_error", "message": "Something went wrong on our side."}}, status=500)
    return render(request, "errors/500.html", status=500)
