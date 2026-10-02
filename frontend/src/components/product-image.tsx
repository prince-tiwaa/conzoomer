"use client";

import { useEffect, useRef, useState } from "react";

import { sizedImage, srcSet } from "@/lib/images";

type Props = {
  src: string | null | undefined;
  alt: string;
  /** Display width used for the default src (srcset covers other sizes). */
  width?: number;
  sizes?: string;
  ratio?: number; // height / width, default 4:5 portrait
  priority?: boolean;
  className?: string;
  label?: string; // shown in the fallback tile
};

/**
 * Remote product photo with a fixed aspect ratio (no layout shift) and a
 * branded fallback tile if the image is missing or fails to load.
 */
export function ProductImage({ src, alt, width = 600, sizes, ratio = 1.25, priority = false, className = "", label }: Props) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  // Server-rendered images can fail before React hydrates and attaches
  // onError, so check once on mount as well.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);
  const height = Math.round(width * ratio);

  return (
    <div className={`relative overflow-hidden bg-sand ${className}`} style={{ aspectRatio: `${1} / ${ratio}` }}>
      {src && !failed ? (
        <img
          ref={imgRef}
          src={sizedImage(src, width, ratio)}
          srcSet={srcSet(src, [320, 480, 640, 800, 1080, 1400], ratio)}
          sizes={sizes}
          alt={alt}
          width={width}
          height={height}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center"
          {...(alt ? { role: "img", "aria-label": alt } : { "aria-hidden": true })}
        >
          <span className="font-display text-5xl font-semibold text-cobalt/80" aria-hidden>
            {(label || alt || "C").trim().charAt(0).toUpperCase()}
          </span>
          {label && width >= 300 && (
            <span className="max-w-[12rem] text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft" aria-hidden>
              {label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
