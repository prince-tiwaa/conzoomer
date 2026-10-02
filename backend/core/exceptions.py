"""Consistent JSON error envelope for every API error.

    {"error": {"code": "out_of_stock", "message": "...", "fields": {...}}}
"""

import logging

from django.core.exceptions import PermissionDenied, ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


class ApiError(exceptions.APIException):
    """Raise for domain errors with a stable machine-readable code."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "bad_request"
    default_detail = "The request could not be completed."

    def __init__(self, message=None, code=None, status_code=None, fields=None, extra=None):
        super().__init__(detail=message or self.default_detail, code=code or self.default_code)
        if status_code:
            self.status_code = status_code
        self.code = code or self.default_code
        self.fields = fields or {}
        self.extra = extra or {}


def _flatten(detail):
    if isinstance(detail, list):
        return " ".join(str(d) for d in detail)
    if isinstance(detail, dict):
        return {k: _flatten(v) for k, v in detail.items()}
    return str(detail)


def api_exception_handler(exc, context):
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, PermissionDenied):
        exc = exceptions.PermissionDenied()
    elif isinstance(exc, DjangoValidationError):
        exc = exceptions.ValidationError(detail=exc.message_dict if hasattr(exc, "message_dict") else exc.messages)

    response = exception_handler(exc, context)
    if response is None:
        logger.exception("Unhandled API error in %s", context.get("view").__class__.__name__)
        return Response(
            {"error": {"code": "server_error", "message": "Something went wrong on our side. Please try again."}},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if isinstance(exc, ApiError):
        body = {"code": exc.code, "message": str(exc.detail)}
        if exc.fields:
            body["fields"] = exc.fields
        body.update(exc.extra)
    elif isinstance(exc, exceptions.ValidationError):
        detail = exc.detail
        fields = _flatten(detail) if isinstance(detail, dict) else {}
        non_field = fields.pop("non_field_errors", None) if isinstance(fields, dict) else None
        message = non_field or (_flatten(detail) if not isinstance(detail, dict) else "Please check the highlighted fields.")
        body = {"code": "validation_error", "message": message}
        if fields:
            body["fields"] = fields
    elif isinstance(exc, exceptions.Throttled):
        body = {"code": "rate_limited", "message": "Too many requests. Please wait a moment and try again."}
        if exc.wait:
            body["retry_after"] = int(exc.wait)
    elif isinstance(exc, exceptions.NotAuthenticated):
        body = {"code": "not_authenticated", "message": "Please sign in to continue."}
    elif isinstance(exc, exceptions.PermissionDenied):
        msg = str(exc.detail)
        if "CSRF" in msg:
            body = {"code": "csrf_failed", "message": "Your session expired. Refresh the page and try again."}
        else:
            body = {"code": "forbidden", "message": "You don't have access to this resource."}
    elif isinstance(exc, exceptions.NotFound):
        body = {"code": "not_found", "message": "We couldn't find what you were looking for."}
    else:
        body = {"code": getattr(exc, "default_code", "error"), "message": _flatten(exc.detail)}

    response.data = {"error": body}
    return response
