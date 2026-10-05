/** Unsplash (imgix) URLs accept size params — request only what the screen needs. */
export function sizedImage(url: string | null | undefined, width: number, ratio = 1.25): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("unsplash.com")) return url;
    u.searchParams.set("w", String(Math.round(width)));
    u.searchParams.set("h", String(Math.round(width * ratio)));
    u.searchParams.set("fit", "crop");
    u.searchParams.set("auto", "format");
    u.searchParams.set("q", "75");
    return u.toString();
  } catch {
    return url;
  }
}
