export type Money = string;
export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";
export interface ImageRef { url: string; alt: string }

export interface Category {
  id: number;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  image_url: string;
  product_count?: number;
}

export interface ProductCard {
  id: number;
  name: string;
  slug: string;
  short_description: string;
  price: Money;
  currency: string;
  category: { name: string; slug: string };
  image: ImageRef | null;
  stock_status: StockStatus;
  available: number | null;
  is_featured: boolean;
}

export interface ProductDetail extends ProductCard {
  sku: string;
  description: string;
  details: { label: string; value: string }[];
  images: ImageRef[];
  max_quantity: number;
}

export interface ProductList {
  count: number;
  page: number;
  num_pages: number;
  results: ProductCard[];
}

export interface Totals {
  currency: string;
  item_count: number;
  subtotal: Money;
  shipping_method: string;
  shipping_method_label: string;
  shipping_total: Money;
  tax_rate: string;
  tax_label: string;
  tax_total: Money;
  total: Money;
}

export interface CartNotice { type: string; product_name: string; message: string }

export interface CartLine {
  id: number;
  quantity: number;
  unit_price: Money;
  line_total: Money;
  product: {
    id: number;
    slug: string;
    name: string;
    category: string;
    image: ImageRef | null;
    stock_status: StockStatus;
    max_quantity: number;
  };
}

export interface Cart {
  items: CartLine[];
  item_count: number;
  currency: string;
  subtotal: Money;
  estimate: Totals;
  free_shipping_threshold: Money;
  notices: CartNotice[];
}

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  name: string;
  picture: string | null;
  provider: string | null;
  date_joined: string;
}

export interface ShippingOption { code: string; label: string; description: string; price: Money }

export interface CheckoutConfig {
  currency: string;
  shipping_methods: ShippingOption[];
  countries: { code: string; name: string }[];
  prefill: { email: string; full_name: string } | null;
}

export interface Address {
  full_name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  country_name?: string;
}

export interface OrderItem {
  id: number;
  product_name: string;
  product_slug: string;
  image_url: string;
  unit_price: Money;
  quantity: number;
  line_total: Money;
}

export interface OrderDetail {
  reference: string;
  status_label: string;
  payment_status_label: string;
  placed_at: string;
  email: string;
  currency: string;
  shipping_method_label: string;
  items: OrderItem[];
  shipping_address: Address;
  totals: { subtotal: Money; shipping_total: Money; tax_rate: string; tax_total: Money; total: Money };
  email_delivery: { status: string; message: string };
}

export interface OrderSummary {
  reference: string;
  status_label: string;
  placed_at: string;
  currency: string;
  total: Money;
  item_count: number;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  fields?: Record<string, unknown>;
  available?: number;
  items?: { product_id: number; available: number; message: string }[];
  totals?: Totals;
}
