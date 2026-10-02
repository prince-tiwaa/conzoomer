"use client";

import Link from "next/link";

import { useSession } from "./providers";

export function RequireUser({ children, next }: { children: React.ReactNode; next: string }) {
  const { session, loading } = useSession();
  if (loading) {
    return (
      <div className="container-page py-12" aria-busy="true" aria-label="Loading your account">
        <div className="skeleton h-12 w-64" />
        <div className="skeleton mt-8 h-40 w-full" />
      </div>
    );
  }
  if (!session?.user) {
    return (
      <div className="container-page py-20">
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-4xl font-medium">Sign in to see your account</h1>
          <p className="mt-3 text-ink-soft">Your order history and saved cart live here. Guest orders can be viewed from the link in your confirmation email.</p>
          <Link href={`/signin?next=${encodeURIComponent(next)}`} className="btn btn-primary btn-lg mt-8">Sign in</Link>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
