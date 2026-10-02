import * as React from "react";
import { ChevronRight, Folder } from "lucide-react";
import { cn } from "../../lib/utils.js";

export interface WorkspaceBreadcrumbsProps {
  path: string;
  className?: string | undefined;
  showIcon?: boolean | undefined;
}

export function parsePathBreadcrumbs(rawPath: string): string[] {
  if (!rawPath || typeof rawPath !== "string") return [];
  let trimmed = rawPath.trim();
  if (!trimmed) return [];

  // Strip Windows extended-length path prefix (\\?\ or //?/)
  if (trimmed.startsWith("\\\\?\\UNC\\") || trimmed.startsWith("//?/UNC/")) {
    trimmed = "\\\\" + trimmed.slice(8);
  } else if (trimmed.startsWith("\\\\?\\") || trimmed.startsWith("//?/")) {
    trimmed = trimmed.slice(4);
  }

  // Strip file:// or file:/// scheme if present
  if (trimmed.startsWith("file://")) {
    trimmed = trimmed.replace(/^file:\/\/\/?/, "");
  }

  trimmed = trimmed.trim();
  if (!trimmed) return [];

  // Detect Windows UNC network path (\\server\share\...)
  const isUnc = trimmed.startsWith("\\\\") || trimmed.startsWith("//");

  const normalized = trimmed.replace(/\\/g, "/");
  const rawParts = normalized.split("/").filter((p) => Boolean(p) && p !== ".");
  if (rawParts.length === 0) {
    return trimmed === "/" ? ["/"] : [];
  }

  let parts: string[];
  if (isUnc) {
    if (rawParts.length >= 2) {
      // Root container is the network share: \\server\share
      parts = [`\\\\${rawParts[0]}\\${rawParts[1]}`, ...rawParts.slice(2)];
    } else {
      parts = [`\\\\${rawParts[0]}`];
    }
  } else {
    parts = rawParts;
  }

  if (parts.length <= 3) return parts;
  return [parts[0]!, "…", parts[parts.length - 2]!, parts[parts.length - 1]!];
}

export function WorkspaceBreadcrumbs({
  path,
  className,
  showIcon = true
}: WorkspaceBreadcrumbsProps) {
  const segments = parsePathBreadcrumbs(path);

  if (segments.length === 0) return null;

  return (
    <nav
      aria-label="Workspace directory hierarchy"
      title={path}
      className={cn("flex items-center gap-1.5 text-xs text-muted-foreground font-mono truncate min-w-0", className)}
    >
      {showIcon && <Folder className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />}
      <ol className="flex items-center gap-1 truncate min-w-0 list-none p-0 m-0">
        {segments.map((segment, idx) => {
          const isLast = idx === segments.length - 1;
          return (
            <li key={idx} className="flex items-center gap-1 truncate min-w-0 shrink-0 last:shrink">
              {idx > 0 && (
                <ChevronRight className="size-3 shrink-0 text-muted-foreground/40" aria-hidden="true" />
              )}
              <span
                className={cn(
                  "truncate",
                  isLast ? "font-semibold text-foreground" : "text-muted-foreground"
                )}
                {...(isLast ? { "aria-current": "location" as const } : {})}
              >
                {segment}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
