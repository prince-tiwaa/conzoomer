import { formatMoney } from "@/lib/format";
import type { StockStatus } from "@/lib/types";

export function Price({ amount, currency, className = "" }: { amount: string; currency: string; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{formatMoney(amount, currency)}</span>;
}

export function StockBadge({ status, available, className = "" }: { status: StockStatus; available?: number | null; className?: string }) {
  if (status === "out_of_stock") {
    return (
      <span className={`inline-flex items-center gap-1.5 text-sm font-medium text-danger ${className}`}>
        <span className="size-1.5 rounded-full bg-danger" aria-hidden />
        Sold out
      </span>
    );
  }
  if (status === "low_stock") {
    return (
      <span className={`inline-flex items-center gap-1.5 text-sm font-medium text-warn ${className}`}>
        <span className="size-1.5 rounded-full bg-warn" aria-hidden />
        {available ? `Only ${available} left` : "Low stock"}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium text-success ${className}`}>
      <span className="size-1.5 rounded-full bg-success" aria-hidden />
      In stock
    </span>
  );
}
