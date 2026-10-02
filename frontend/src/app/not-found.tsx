import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page py-24">
      <div className="mx-auto max-w-lg text-center">
        <p className="eyebrow">404</p>
        <h1 className="mt-3 text-5xl font-medium">We couldn&apos;t find that page.</h1>
        <p className="mt-4 text-lg text-ink-soft">It may have moved, or the product is no longer available.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/shop" className="btn btn-primary btn-lg">Shop the collection</Link>
          <Link href="/" className="btn btn-outline btn-lg">Go home</Link>
        </div>
      </div>
    </div>
  );
}
