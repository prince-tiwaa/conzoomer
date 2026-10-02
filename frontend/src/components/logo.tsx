import Link from "next/link";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-semibold tracking-[-0.04em] ${className}`} style={{ fontVariationSettings: '"SOFT" 50, "WONK" 1' }}>
      conzoomer<span className="text-cobalt">.</span>
    </span>
  );
}

export function Logo() {
  return (
    <Link href="/" className="inline-flex items-center rounded-md text-[1.6rem] leading-none text-ink" aria-label="Conzoomer home">
      <Wordmark />
    </Link>
  );
}
