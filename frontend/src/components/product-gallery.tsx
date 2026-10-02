"use client";

import { useState } from "react";

import type { ImageRef } from "@/lib/types";

import { ProductImage } from "./product-image";

export function ProductGallery({ images, name, category }: { images: ImageRef[]; name: string; category: string }) {
  const [active, setActive] = useState(0);
  const list = images.length ? images : [{ url: "", alt: name }];
  const current = list[Math.min(active, list.length - 1)];

  return (
    <div className="flex flex-col gap-3 lg:flex-row-reverse lg:gap-4">
      <div className="flex-1 overflow-hidden rounded-[1.75rem]">
        <ProductImage
          key={current.url}
          src={current.url || null}
          alt={current.alt || name}
          label={category}
          width={1000}
          priority
          sizes="(min-width: 1024px) 46vw, 100vw"
        />
      </div>
      {list.length > 1 && (
        <ul className="flex gap-3 lg:w-20 lg:flex-col" aria-label="Product images">
          {list.map((img, i) => (
            <li key={img.url + i} className="w-[4.5rem] lg:w-full">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show image ${i + 1} of ${list.length}`}
                aria-pressed={i === active}
                className={`block w-full overflow-hidden rounded-xl ring-offset-2 ring-offset-ivory transition-shadow ${i === active ? "ring-2 ring-ink" : "opacity-80 hover:opacity-100"}`}
              >
                <ProductImage src={img.url} alt="" width={160} label={category} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
