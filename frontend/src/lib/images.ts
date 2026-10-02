/**
 * Unsplash (imgix) URLs accept w/h params, so we can serve right-sized images
 * without a server-side optimiser. Other URLs are returned unchanged.
 */
export function sizedImage(url: string, width: number, ratio = 1.25): string {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("unsplash.com")) return url;
    u.searchParams.set("w", String(width));
    u.searchParams.set("h", String(Math.round(width * ratio)));
    u.searchParams.set("fit", "crop");
    u.searchParams.set("auto", "format");
    u.searchParams.set("q", width > 900 ? "75" : "80");
    return u.toString();
  } catch {
    return url;
  }
}

export function srcSet(url: string, widths: number[], ratio = 1.25): string | undefined {
  try {
    if (!new URL(url).hostname.endsWith("unsplash.com")) return undefined;
  } catch {
    return undefined;
  }
  return widths.map((w) => `${sizedImage(url, w, ratio)} ${w}w`).join(", ");
}
