"""Repeatable demo catalog: `python manage.py seed_catalog`.

Safe to run many times — rows are matched by SKU and updated in place.
Stock is only reset when --reset-stock is passed, so running the seed again
won't undo demo purchases unless you ask it to.

Images are Unsplash photos (free to use under the Unsplash License),
hot-linked with crop parameters. Detail shots are tighter crops of the same
photo. The storefront shows a branded fallback if an image fails to load.
"""

from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from catalog.models import Category, Product, ProductImage

U = "https://images.unsplash.com/photo-{id}?auto=format&fit=crop&w=1200&h=1500&q=80"
CROPS = [
    "",
    "&crop=focalpoint&fp-x=0.5&fp-y=0.5&fp-z=1.6",
    "&crop=focalpoint&fp-x=0.35&fp-y=0.4&fp-z=2.4",
]

CATEGORIES = [
    {
        "slug": "tech",
        "name": "Tech",
        "tagline": "Quiet, capable gadgets",
        "description": "Well-made devices that do one job beautifully and get out of the way.",
        "image": "1505740420928-5e560c06d30e",
    },
    {
        "slug": "home",
        "name": "Home",
        "tagline": "Pieces for slower mornings",
        "description": "Objects for the kitchen, desk and living room that earn their place.",
        "image": "1507473885765-e6ed057f782c",
    },
    {
        "slug": "lifestyle",
        "name": "Lifestyle",
        "tagline": "Carry less, carry better",
        "description": "Everyday essentials for getting out the door and back again.",
        "image": "1553062407-98eeb64c6a62",
    },
]

PRODUCTS = [
    # ---- Tech ----------------------------------------------------------------
    {
        "slug": "halo-over-ear-headphones",
        "sku": "CZ-TEC-001",
        "category": "tech",
        "name": "Halo Over-Ear Headphones",
        "price": "189.00",
        "stock": 24,
        "featured": True,
        "image": "1505740420928-5e560c06d30e",
        "short": "Wireless over-ears with soft memory-foam cushions and all-day battery.",
        "description": (
            "Halo is built for long listening sessions. Plush protein-leather cushions spread the clamp evenly, "
            "the headband folds flat for travel, and a single charge carries you through a full working week of "
            "commutes. Physical buttons on the right cup mean no fumbling with touch gestures."
        ),
        "details": [
            ("Battery", "Up to 40 hours"),
            ("Connection", "Bluetooth 5.3, 3.5 mm wired"),
            ("Weight", "260 g"),
            ("In the box", "Carry pouch, USB-C cable, audio cable"),
        ],
    },
    {
        "slug": "pocket-wireless-earbuds",
        "sku": "CZ-TEC-002",
        "category": "tech",
        "name": "Pocket Wireless Earbuds",
        "price": "129.00",
        "stock": 40,
        "featured": False,
        "image": "1590658268037-6bf12165a8df",
        "short": "A compact charging case and a snug fit for runs, calls and commutes.",
        "description": (
            "Three sizes of silicone tips give a secure seal, and the pebble-shaped case slips into a coin pocket. "
            "Transparency mode lets traffic and announcements through when you need them."
        ),
        "details": [
            ("Battery", "6 hours (24 with case)"),
            ("Water resistance", "IPX4 sweat and splash"),
            ("Charging", "USB-C and Qi wireless"),
        ],
    },
    {
        "slug": "tempo-smartwatch",
        "sku": "CZ-TEC-003",
        "category": "tech",
        "name": "Tempo Smartwatch",
        "price": "249.00",
        "stock": 3,
        "featured": True,
        "image": "1546868871-7041f2a55e12",
        "short": "Heart-rate, sleep and workout tracking in a slim aluminium case.",
        "description": (
            "Tempo keeps the essentials on your wrist — notifications, timers, workouts and sleep trends — "
            "without demanding a nightly charge. The always-on display stays readable in bright sun."
        ),
        "details": [
            ("Case", "41 mm aluminium"),
            ("Battery", "Up to 5 days"),
            ("Water resistance", "5 ATM"),
            ("Strap", "Soft-touch silicone, quick release"),
        ],
    },
    {
        "slug": "snap-instant-camera",
        "sku": "CZ-TEC-004",
        "category": "tech",
        "name": "Snap Instant Camera",
        "price": "99.00",
        "stock": 0,
        "featured": False,
        "image": "1526170375885-4d8ecf77b99f",
        "short": "Point, shoot and hold a print in your hand a minute later.",
        "description": (
            "Automatic exposure and a built-in flash make Snap easy for anyone at the table to use. "
            "A small selfie mirror sits beside the lens for group shots."
        ),
        "details": [
            ("Film", "Instant mini film (sold separately)"),
            ("Power", "2 × AA batteries"),
            ("Focus", "0.6 m to infinity"),
        ],
    },
    {
        "slug": "draft-mechanical-keyboard",
        "sku": "CZ-TEC-005",
        "category": "tech",
        "name": "Draft Mechanical Keyboard",
        "price": "139.00",
        "stock": 18,
        "featured": False,
        "image": "1587829741301-dc798b83add3",
        "short": "A compact 75% layout with smooth, quiet tactile switches.",
        "description": (
            "Draft trims the number pad but keeps the arrow and function keys you reach for. Hot-swappable "
            "sockets let you try new switches without soldering, and PBT keycaps resist shine."
        ),
        "details": [
            ("Layout", "75%, 84 keys"),
            ("Connection", "USB-C, Bluetooth (3 devices)"),
            ("Switches", "Tactile, hot-swappable"),
        ],
    },
    # ---- Home ----------------------------------------------------------------
    {
        "slug": "arc-table-lamp",
        "sku": "CZ-HOM-001",
        "category": "home",
        "name": "Arc Table Lamp",
        "price": "118.00",
        "stock": 12,
        "featured": True,
        "image": "1507473885765-e6ed057f782c",
        "short": "Warm, glare-free light for reading corners and bedside tables.",
        "description": (
            "Arc's shade throws light downward where you need it and keeps the bulb out of sight. "
            "A dimmer on the cord takes you from bright task light to a low evening glow."
        ),
        "details": [
            ("Height", "46 cm"),
            ("Bulb", "E27 LED, 2700 K (included)"),
            ("Cable", "2 m fabric cord with inline dimmer"),
        ],
    },
    {
        "slug": "porcelain-everyday-mug",
        "sku": "CZ-HOM-002",
        "category": "home",
        "name": "Porcelain Everyday Mug",
        "price": "18.00",
        "stock": 30,
        "featured": True,
        "image": "1514228742587-6b1558fcca3d",
        "short": "A plain white mug with a generous handle and a satisfying weight.",
        "description": (
            "Fine white porcelain with a smooth, rounded rim that's pleasant to drink from. Big enough for a "
            "proper morning coffee and simple enough to go with everything else in the cupboard."
        ),
        "details": [
            ("Capacity", "350 ml"),
            ("Material", "Porcelain"),
            ("Care", "Dishwasher and microwave safe"),
        ],
    },
    {
        "slug": "studio-step-stool",
        "sku": "CZ-HOM-003",
        "category": "home",
        "name": "Studio Step Stool",
        "price": "95.00",
        "stock": 7,
        "featured": False,
        "image": "1503602642458-232111445657",
        "short": "A tall wooden stool that doubles as a side table or plant stand.",
        "description": (
            "Simple joinery, a footrest rail and a soft matte finish. Tall enough for a kitchen counter, light "
            "enough to carry to wherever you need an extra seat."
        ),
        "details": [
            ("Seat height", "65 cm"),
            ("Material", "Solid wood, matte painted finish"),
            ("Load", "Tested to 110 kg"),
        ],
    },
    {
        "slug": "cafe-cup-pair",
        "sku": "CZ-HOM-004",
        "category": "home",
        "name": "Café Cup Pair",
        "price": "34.00",
        "stock": 22,
        "featured": False,
        "image": "1495474472287-4d71bcdd2085",
        "short": "Two dark-glazed stoneware cups sized for a flat white or cappuccino.",
        "description": (
            "Wide, shallow bowls show off latte art and keep drinks at a comfortable temperature. "
            "The dark speckled glaze hides everyday wear."
        ),
        "details": [
            ("Capacity", "220 ml each"),
            ("Material", "Glazed stoneware"),
            ("Includes", "2 cups"),
        ],
    },
    {
        "slug": "terracotta-planter",
        "sku": "CZ-HOM-005",
        "category": "home",
        "name": "Terracotta Planter",
        "price": "36.00",
        "stock": 45,
        "featured": False,
        "image": "1485955900006-10f4d324d411",
        "short": "A breathable clay pot with a drainage hole and matching saucer.",
        "description": (
            "Unglazed terracotta lets roots breathe and helps prevent overwatering. "
            "Sized for most medium houseplants. Plant not included."
        ),
        "details": [
            ("Diameter", "20 cm"),
            ("Material", "Unglazed terracotta"),
            ("Includes", "Saucer"),
        ],
    },
    # ---- Lifestyle -----------------------------------------------------------
    {
        "slug": "everyday-commuter-backpack",
        "sku": "CZ-LIF-001",
        "category": "lifestyle",
        "name": "Everyday Commuter Backpack",
        "price": "135.00",
        "stock": 16,
        "featured": True,
        "image": "1553062407-98eeb64c6a62",
        "short": "A clean, water-resistant daypack with a padded 16-inch laptop sleeve.",
        "description": (
            "A clamshell opening makes packing easy, while a hidden back pocket keeps your passport and "
            "wallet close. Breathable straps stay comfortable on longer walks."
        ),
        "details": [
            ("Capacity", "22 litres"),
            ("Laptop sleeve", "Fits up to 16 inches"),
            ("Material", "Water-resistant recycled polyester"),
        ],
    },
    {
        "slug": "coastline-sunglasses",
        "sku": "CZ-LIF-002",
        "category": "lifestyle",
        "name": "Coastline Sunglasses",
        "price": "85.00",
        "stock": 28,
        "featured": False,
        "image": "1572635196237-14b3f281503f",
        "short": "Polarised lenses in a lightweight frame that suits most faces.",
        "description": (
            "Polarised lenses cut glare from water and pavement, and spring hinges keep the fit comfortable. "
            "Comes with a hard case and a microfibre cloth."
        ),
        "details": [
            ("Lenses", "Polarised, UV400"),
            ("Frame", "Lightweight acetate"),
            ("Includes", "Hard case, cleaning cloth"),
        ],
    },
    {
        "slug": "pace-sport-watch",
        "sku": "CZ-LIF-003",
        "category": "lifestyle",
        "name": "Pace Sport Watch",
        "price": "149.00",
        "stock": 9,
        "featured": True,
        "image": "1523275335684-37898b6baf30",
        "short": "A clean round face and a soft white strap for training and everyday wear.",
        "description": (
            "Pace keeps things simple: time, steps, workouts and a gentle vibration for notifications. "
            "The light silicone strap is comfortable on runs and easy to rinse clean."
        ),
        "details": [
            ("Case", "40 mm"),
            ("Battery", "Up to 7 days"),
            ("Water resistance", "5 ATM"),
            ("Strap", "White silicone, quick release"),
        ],
    },
    {
        "slug": "cedar-and-fig-eau-de-parfum",
        "sku": "CZ-LIF-005",
        "category": "lifestyle",
        "name": "Cedar & Fig Eau de Parfum",
        "price": "92.00",
        "stock": 14,
        "featured": False,
        "image": "1541643600914-78b084683601",
        "short": "A warm, green scent with notes of fig leaf, cedar and soft musk.",
        "description": (
            "Fresh at first spray, settling into a woody, comfortable base. Long-lasting without being loud — "
            "an easy everyday fragrance."
        ),
        "details": [
            ("Size", "50 ml"),
            ("Notes", "Fig leaf, cedarwood, musk"),
        ],
    },
]


class Command(BaseCommand):
    help = "Create or update the Conzoomer demo catalog (14 products across Tech, Home and Lifestyle)."

    def add_arguments(self, parser):
        parser.add_argument("--reset-stock", action="store_true", help="Restore seeded stock levels.")

    @transaction.atomic
    def handle(self, *args, reset_stock=False, **options):
        categories = {}
        for order, c in enumerate(CATEGORIES):
            categories[c["slug"]], _ = Category.objects.update_or_create(
                slug=c["slug"],
                defaults={
                    "name": c["name"],
                    "tagline": c["tagline"],
                    "description": c["description"],
                    "image_url": U.format(id=c["image"]),
                    "sort_order": order,
                },
            )

        now = timezone.now()
        created = updated = 0
        for index, p in enumerate(PRODUCTS):
            defaults = {
                "category": categories[p["category"]],
                "name": p["name"],
                "slug": p["slug"],
                "short_description": p["short"],
                "description": p["description"],
                "price": Decimal(p["price"]),
                "is_active": True,
                "is_featured": p["featured"],
                "details": [{"label": k, "value": v} for k, v in p["details"]],
            }
            product = Product.objects.filter(sku=p["sku"]).first()
            if product is None:
                product = Product.objects.create(sku=p["sku"], stock=p["stock"], **defaults)
                created += 1
            else:
                for field, value in defaults.items():
                    setattr(product, field, value)
                if reset_stock:
                    product.stock = p["stock"]
                product.save()
                updated += 1
            # Stagger creation dates so "Newest" sorting is meaningful.
            Product.objects.filter(pk=product.pk).update(created_at=now - timedelta(days=index * 3))

            product.images.all().delete()
            base = U.format(id=p["image"])
            ProductImage.objects.bulk_create([
                ProductImage(
                    product=product,
                    url=base + crop,
                    alt=p["name"] if i == 0 else f"{p['name']} — detail view {i}",
                    position=i,
                )
                for i, crop in enumerate(CROPS)
            ])

        # Hide earlier demo products that are no longer part of the seed.
        retired = Product.objects.filter(sku__startswith="CZ-").exclude(sku__in=[p["sku"] for p in PRODUCTS]).update(is_active=False)

        self.stdout.write(self.style.SUCCESS(
            f"Catalog ready: {len(categories)} categories, {created} products created, {updated} updated, {retired} retired."
        ))
