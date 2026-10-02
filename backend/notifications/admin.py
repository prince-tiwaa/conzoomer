from django.contrib import admin, messages

from .models import EmailDeliveryAttempt, EmailMessage
from .services import retry_now, send_due


class AttemptInline(admin.TabularInline):
    model = EmailDeliveryAttempt
    extra = 0
    can_delete = False
    readonly_fields = ["backend", "succeeded", "status_code", "error", "created_at"]

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(EmailMessage)
class EmailMessageAdmin(admin.ModelAdmin):
    list_display = ["kind", "to_email", "status", "backend", "attempts", "next_attempt_at", "sent_at", "created_at"]
    list_filter = ["status", "kind", "backend"]
    search_fields = ["to_email", "dedupe_key", "order__reference"]
    readonly_fields = [
        "kind", "dedupe_key", "order", "to_email", "subject", "status", "backend", "attempts", "next_attempt_at",
        "last_error", "provider_message_id", "claimed_at", "sent_at", "created_at", "text_body",
    ]
    exclude = ["html_body"]
    inlines = [AttemptInline]
    actions = ["action_retry"]

    @admin.action(description="Retry selected emails now (re-sends previews through the current backend)")
    def action_retry(self, request, queryset):
        count = retry_now(queryset)
        stats = send_due()
        self.message_user(request, f"Queued {count}; processed {stats['processed']} (sent {stats['sent']}, previewed {stats['previewed']}, retrying {stats['retrying']}, failed {stats['failed']}).", messages.INFO)

    def has_add_permission(self, request):
        return False
