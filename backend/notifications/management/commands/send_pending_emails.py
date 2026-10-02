import time

from django.core.management.base import BaseCommand

from notifications.services import send_due


class Command(BaseCommand):
    help = "Deliver queued transactional emails (with retries). Use --loop to run as a worker."

    def add_arguments(self, parser):
        parser.add_argument("--loop", action="store_true", help="Keep running, polling every --interval seconds.")
        parser.add_argument("--interval", type=int, default=30)
        parser.add_argument("--limit", type=int, default=50)

    def handle(self, *args, loop=False, interval=30, limit=50, **options):
        while True:
            stats = send_due(limit=limit)
            if stats["processed"] or not loop:
                self.stdout.write(
                    f"processed={stats['processed']} sent={stats['sent']} previewed={stats['previewed']} "
                    f"retrying={stats['retrying']} failed={stats['failed']}"
                )
            if not loop:
                return
            time.sleep(interval)
