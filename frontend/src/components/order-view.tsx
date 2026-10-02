import Link from "next/link";
import { Mail, MailCheck, MailWarning } from "lucide-react";

import { formatDateTime, formatMoney } from "@/lib/format";
import type { Address, OrderDetail } from "@/lib/types";

import { ProductImage } from "./product-image";

function AddressBlock({ title, address }: { title: string; address: Address }) {
  return (
    <div>
      <h3 className="font-sans text-sm font-semibold uppercase tracking-[0.12em] text-ink-muted">{title}</h3>
      <address className="mt-2 not-italic leading-relaxed">
        {address.full_name}<br />
        {address.line1}<br />
        {address.line2 && <>{address.line2}<br /></>}
        {[address.city, address.region, address.postal_code].filter(Boolean).join(", ")}<br />
        {address.country_name ?? address.country}
      </address>
    </div>
  );
}

export function EmailStatus({ order, previewHref }: { order: OrderDetail; previewHref?: string }) {
  const s = order.email_delivery.status;
  const Icon = s === "sent" ? MailCheck : s === "failed" ? MailWarning : Mail;
  const tone =
    s === "sent" ? "border-success/25 bg-success-wash text-success" : s === "failed" ? "border-warn/25 bg-warn-wash text-warn" : "border-line bg-paper text-ink-soft";
  return (
    <div className={`flex gap-3 rounded-2xl border p-4 text-sm ${tone}`} role="status">
      <Icon className="size-5 shrink-0" aria-hidden />
      <div>
        <p className="font-medium">{order.email_delivery.message}</p>
        {s === "previewed" && previewHref && (
          <a href={previewHref} target="_blank" rel="noopener" className="link mt-1 inline-block font-semibold">
            Open the email preview<span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
      </div>
    </div>
  );
}

export function OrderView({ order }: { order: OrderDetail }) {
  const c = order.currency;
  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
      <section aria-labelledby="items-title" className="lg:col-span-7">
        <h2 id="items-title" className="text-2xl font-medium">Items</h2>
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {order.items.map((item) => (
            <li key={item.id} className="flex gap-4 py-5">
              <div className="w-20 shrink-0 overflow-hidden rounded-xl">
                <ProductImage src={item.image_url || null} alt="" width={200} label={item.product_name} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  <Link href={`/products/${item.product_slug}`} className="hover:underline">{item.product_name}</Link>
                </p>
                <p className="mt-1 text-sm text-ink-muted">Qty {item.quantity} · {formatMoney(item.unit_price, c)} each</p>
              </div>
              <p className="font-medium tabular-nums">{formatMoney(item.line_total, c)}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-5 space-y-3 text-[0.9375rem]">
          <div className="flex justify-between"><dt className="text-ink-soft">Subtotal</dt><dd className="tabular-nums">{formatMoney(order.totals.subtotal, c)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">Shipping · {order.shipping_method_label}</dt><dd className="tabular-nums">{Number(order.totals.shipping_total) === 0 ? "Free" : formatMoney(order.totals.shipping_total, c)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">Tax (demo rate {(Number(order.totals.tax_rate) * 100).toFixed(1).replace(/\.0$/, "")}%)</dt><dd className="tabular-nums">{formatMoney(order.totals.tax_total, c)}</dd></div>
          <div className="flex justify-between border-t border-line pt-4 text-lg font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(order.totals.total, c)}</dd></div>
          <div className="flex justify-between text-sm"><dt className="text-ink-muted">Payment</dt><dd className="font-medium text-cobalt-deep">{order.payment_status_label}</dd></div>
        </dl>
      </section>

      <aside className="space-y-6 lg:col-span-5">
        <div className="card space-y-6 p-6">
          <div>
            <h3 className="font-sans text-sm font-semibold uppercase tracking-[0.12em] text-ink-muted">Contact</h3>
            <p className="mt-2">{order.email}{order.phone && <><br />{order.phone}</>}</p>
          </div>
          <AddressBlock title="Shipping to" address={order.shipping_address} />
          <AddressBlock title="Billing address" address={order.billing_address} />
          <div>
            <h3 className="font-sans text-sm font-semibold uppercase tracking-[0.12em] text-ink-muted">Status</h3>
            <ol className="mt-2 space-y-1.5">
              {order.events.map((e, i) => (
                <li key={i} className="text-sm">
                  <span className="font-semibold">{e.label}</span> <span className="text-ink-muted">· {formatDateTime(e.at)}</span>
                  {e.note && <span className="block text-ink-muted">{e.note}</span>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </aside>
    </div>
  );
}

export function OrderSkeleton() {
  return (
    <div className="container-page py-12" aria-busy="true" aria-label="Loading order">
      <div className="skeleton h-4 w-28" />
      <div className="skeleton mt-4 h-12 w-80 max-w-full" />
      <div className="mt-10 grid gap-10 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-20 w-full" />)}</div>
        <div className="skeleton h-72 lg:col-span-5" />
      </div>
    </div>
  );
}
