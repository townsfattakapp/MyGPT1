import React from 'react';

export default function TypeLoading() {
  return (
    <div className="flex h-5 items-center gap-1.5" aria-label="Generating response">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--matte-jade)] opacity-70" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--matte-jade)] opacity-50" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--matte-jade)] opacity-35" />
    </div>
  );
}
