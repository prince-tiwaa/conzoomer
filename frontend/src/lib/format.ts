const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: string | number, currency = "USD"): string {
  const key = currency;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 });
    formatters.set(key, f);
  }
  // Display only — all arithmetic happens on the server with decimals.
  return f.format(typeof amount === "string" ? Number(amount) : amount);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function pluralize(n: number, one: string, many = one + "s"): string {
  return `${n} ${n === 1 ? one : many}`;
}
