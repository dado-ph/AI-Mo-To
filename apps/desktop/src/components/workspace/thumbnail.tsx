import * as React from "react";
import { useState, useEffect } from "react";
import { cn } from "../../lib/utils.js";

export interface WorkspaceThumbnailProps {
  thumbnailUrl?: string | undefined;
  name: string;
  size?: "sm" | "md" | "lg" | "fill" | undefined;
  className?: string | undefined;
  alt?: string | undefined;
}

export function WorkspaceThumbnail({
  thumbnailUrl,
  name,
  size = "fill",
  className,
  alt
}: WorkspaceThumbnailProps) {
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoadError(false);
  }, [thumbnailUrl]);

  const cleanUrl = thumbnailUrl?.trim();

  // High-contrast lettermark fallback
  const trimmedName = name.trim();
  const lettermark = (trimmedName.slice(0, 1) || "W").toUpperCase();

  const sizeClasses = {
    sm: "size-8 text-xs font-bold",
    md: "size-12 text-base font-bold",
    lg: "size-20 text-2xl font-bold",
    fill: "h-full w-full text-5xl font-bold"
  }[size];

  if (!cleanUrl || loadError) {
    return (
      <div
        className={cn(
          "grid place-items-center rounded-lg bg-primary/10 border border-primary/20 text-primary font-bold select-none",
          sizeClasses,
          className
        )}
        data-testid="thumbnail-fallback"
        aria-label={alt ?? `${name} avatar`}
      >
        <span className="aimoto-display tracking-wider">{lettermark}</span>
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden select-none", sizeClasses, className)}>
      <img
        src={cleanUrl}
        alt={alt ?? `${name} thumbnail`}
        className="h-full w-full object-cover"
        onError={() => setLoadError(true)}
        data-testid="thumbnail-image"
      />
    </div>
  );
}
