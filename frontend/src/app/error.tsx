"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="container-page py-24">
      <div className="mx-auto max-w-lg text-center" role="alert">
        <h1 className="text-4xl font-medium">Something went wrong.</h1>
        <p className="mt-4 text-lg text-ink-soft">We couldn&apos;t load this page. Your cart is safe — please try again.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="btn btn-primary btn-lg">Try again</button>
          <Link href="/" className="btn btn-outline btn-lg">Go home</Link>
        </div>
      </div>
    </div>
  );
}
