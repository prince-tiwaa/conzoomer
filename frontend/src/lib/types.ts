export type Money = string; // decimal string from the API, e.g. "189.00"

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export interface ImageRef {
  url: string;
  alt: string;
}

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
  created_at: string;
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
  page_size: number;
  num_pages: number;
  results: ProductCard[];
  category: Category | null;
  price_bounds: { min: Money | null; max: Money | null };
}

export interface Totals {
  currency: string;
  item_count: number;
  subtotal: Money;
  shipping_method: string;
  shipping_method_label: string;
  shipping_total: Money;
  discount_total: Money;
  tax_rate: string;
  tax_label: string;
  tax_total: Money;
  total: Money;
}

export interface CartNotice {
  type: "removed" | "quantity_reduced" | "price_changed";
  product_name: string;
  message: string;
  old_price?: Money;
  new_price?: Money;
}

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

export interface SessionUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  name: string;
  picture: string | null;
  provider: string | null;
  date_joined: string;
}

export interface SessionInfo {
  user: SessionUser | null;
  cart_count: number;
  google_enabled: boolean;
  dev_login_enabled: boolean;
  currency: string;
  mail_backend: string;
}

export interface ShippingOption {
  code: string;
  label: string;
  description: string;
  price: Money;
  base_price: Money;
  free_over_threshold: boolean;
}

export interface CheckoutConfig {
  currency: string;
  shipping_methods: ShippingOption[];
  free_shipping_threshold: Money;
  tax_rate: string;
  tax_label: string;
  countries: { code: string; name: string }[];
  prefill: { email: string; full_name: string } | null;
  payment_mode: "demo";
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
  phone?: string;
}

export interface OrderItem {
  id: number;
  product_name: string;
  product_slug: string;
  sku: string;
  image_url: string;
  unit_price: Money;
  quantity: number;
  line_total: Money;
}

export interface OrderDetail {
  reference: string;
  status: string;
  status_label: string;
  payment_status: string;
  payment_status_label: string;
  placed_at: string;
  email: string;
  phone: string;
  currency: string;
  shipping_method: string;
  shipping_method_label: string;
  items: OrderItem[];
  shipping_address: Address;
  billing_address: Address;
  totals: {
    subtotal: Money;
    shipping_total: Money;
    discount_total: Money;
    tax_rate: string;
    tax_total: Money;
    total: Money;
  };
  email_delivery: { status: string; message: string; preview_available?: boolean };
  events: { status: string; label: string; note: string; at: string }[];
}

export interface OrderSummary {
  reference: string;
  status: string;
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
  retry_after?: number;
}
