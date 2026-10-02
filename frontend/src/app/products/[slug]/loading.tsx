export default function Loading() {
  return (
    <div className="container-page pt-8 lg:pt-12" aria-busy="true" aria-label="Loading product">
      <div className="skeleton h-4 w-48" />
      <div className="mt-6 grid gap-10 lg:grid-cols-12 lg:gap-14">
        <div className="skeleton aspect-[4/5] w-full rounded-[1.75rem] lg:col-span-7" />
        <div className="space-y-4 lg:col-span-5">
          <div className="skeleton h-3 w-20" />
          <div className="skeleton h-12 w-4/5" />
          <div className="skeleton h-7 w-28" />
          <div className="skeleton h-20 w-full" />
          <div className="skeleton h-12 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}
