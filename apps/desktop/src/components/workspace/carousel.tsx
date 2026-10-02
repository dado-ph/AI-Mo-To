import * as React from "react";
import { useEffect, useRef, useCallback } from "react";
import type { WorkspaceInspection } from "@ai-mo-to/engine";
import type { WorkspacePresentation } from "../../contracts.js";
import { WorkspaceThumbnail } from "./thumbnail.js";
import { WorkspaceBreadcrumbs } from "./breadcrumbs.js";
import { Button } from "../ui/button.js";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { cn } from "../../lib/utils.js";

export interface AdaptiveCarouselProps {
  workspaces: WorkspaceInspection[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onLaunchWorkspace: (workspace: WorkspaceInspection) => void;
  presentations?: Record<string, WorkspacePresentation> | undefined;
  className?: string | undefined;
  terminalStage?: "hidden" | "partial" | "full" | undefined;
}

export function AdaptiveCarousel({
  workspaces,
  selectedIndex,
  onSelectIndex,
  onLaunchWorkspace,
  presentations,
  className,
  terminalStage = "hidden"
}: AdaptiveCarouselProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const count = workspaces.length;
  const safeIndex = count > 0 ? Math.min(Math.max(0, selectedIndex), count - 1) : 0;

  // Defensive clamping of selectedIndex when filtered workspaces count changes
  useEffect(() => {
    if (count > 0 && selectedIndex >= count) {
      onSelectIndex(Math.max(0, count - 1));
    } else if (count > 0 && selectedIndex < 0) {
      onSelectIndex(0);
    }
  }, [count, selectedIndex, onSelectIndex]);

  const touchStartX = useRef<number | null>(null);

  const move = useCallback(
    (delta: number) => {
      if (count <= 1) return;
      onSelectIndex((safeIndex + delta + count) % count);
    },
    [count, onSelectIndex, safeIndex]
  );

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const diff = endX - touchStartX.current;
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        move(-1);
      } else {
        move(1);
      }
    }
    touchStartX.current = null;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore keyboard events when focus is inside an input, textarea, or dialog
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable ||
        target?.closest("[role='dialog']")
      ) {
        return;
      }

      if (count === 0) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        move(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        move(1);
      } else if (e.key === "Home") {
        e.preventDefault();
        onSelectIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        onSelectIndex(count - 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [count, move, onSelectIndex]);

  if (count === 0) {
    return null;
  }

  return (
    <section
      ref={containerRef}
      aria-roledescription="carousel"
      aria-label="Workspace Carousel"
      data-terminal-stage={terminalStage}
      data-size-responsive="true"
      className={cn(
        "relative flex flex-col items-center justify-center w-full max-w-[1500px] mx-auto select-none transition-all duration-300",
        terminalStage === "partial"
          ? "px-4 sm:px-6 pt-3 pb-[300px] sm:pb-[320px] flex-1 justify-center min-h-0"
          : terminalStage === "full"
          ? "px-4 sm:px-6 pt-2 pb-[74vh] flex-1 justify-center min-h-0"
          : "px-4 sm:px-6 pt-4 sm:pt-6 pb-20 sm:pb-24 flex-1 justify-center min-h-0",
        className
      )}
    >
      {/* 2D Flat Sliding Stage Container */}
      <div className="relative flex items-center justify-center w-full transition-all duration-300">
        {/* Previous Button */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={count <= 1}
          onClick={() => move(-1)}
          aria-label="Previous workspace"
          title="Previous workspace (ArrowLeft)"
          className={cn(
            "z-30 shrink-0 rounded-full border-border/80 bg-card/90 shadow-md hover:bg-accent text-foreground focus-visible:ring-2 focus-visible:ring-ring transition-all duration-200",
            terminalStage === "full"
              ? "size-8 mr-2 sm:mr-3"
              : terminalStage === "partial"
              ? "size-9 sm:size-10 mr-2 sm:mr-4"
              : "size-9 sm:size-11 mr-2 sm:mr-4 md:mr-6"
          )}
        >
          <ChevronLeft className={cn(terminalStage === "full" ? "size-4" : "size-5")} />
        </Button>

        {/* Flat 2D Viewport Frame */}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className={cn(
            "relative w-full overflow-hidden rounded-2xl border border-border bg-card shadow-lg transition-all duration-300",
            terminalStage === "partial"
              ? "max-w-lg sm:max-w-xl md:max-w-2xl lg:max-w-3xl"
              : terminalStage === "full"
              ? "max-w-md sm:max-w-lg md:max-w-xl"
              : "max-w-xl sm:max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl"
          )}
        >
          {/* Horizontal Sliding Track */}
          <div
            className="flex flex-row items-stretch w-full transition-transform duration-300 ease-out"
            style={{
              transform: `translateX(-${safeIndex * 100}%)`
            }}
          >
            {workspaces.map((item, index) => {
              const isCenter = index === safeIndex;
              const presentation = presentations?.[item.root];

              return (
                <div
                  key={item.root}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${item.name} (${index + 1} of ${count})`}
                  aria-hidden={!isCenter}
                  onClick={() => {
                    if (!isCenter) {
                      onSelectIndex(index);
                    }
                  }}
                  tabIndex={-1}
                  className={cn(
                    "aimoto-carousel-card w-full shrink-0 flex flex-col text-left focus-visible:outline-none transition-colors",
                    isCenter ? "aimoto-carousel-center" : "cursor-pointer"
                  )}
                >
                  {/* Slide Top Metadata Bar */}
                  <div
                    className={cn(
                      "flex items-center justify-between border-b border-border/80 bg-card transition-all duration-200",
                      terminalStage === "full"
                        ? "px-3 py-1.5"
                        : terminalStage === "partial"
                        ? "px-4 sm:px-5 py-2 sm:py-2.5"
                        : "px-4 sm:px-6 py-3 sm:py-4"
                    )}
                  >
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 pr-2 sm:pr-4">
                      <h2
                        className={cn(
                          "aimoto-display font-bold truncate text-foreground",
                          terminalStage === "full"
                            ? "text-sm sm:text-base"
                            : terminalStage === "partial"
                            ? "text-base sm:text-lg"
                            : "text-base sm:text-lg md:text-xl"
                        )}
                      >
                        {item.name}
                      </h2>
                      <span className="sr-only">rev {item.revision}</span>
                    </div>
                  </div>

                  {/* Slide Visual Thumbnail Canvas */}
                  <div
                    className={cn(
                      "relative w-full bg-muted/30 overflow-hidden group flex items-center justify-center transition-all duration-300",
                      terminalStage === "full"
                        ? "aspect-[24/9] max-h-[min(12vh,110px)] min-h-[64px]"
                        : terminalStage === "partial"
                        ? "aspect-[16/8] sm:aspect-[21/9] max-h-[min(26vh,240px)] min-h-[120px] sm:min-h-[140px]"
                        : "aspect-[16/10] sm:aspect-[16/9] max-h-[min(52vh,540px)] 2xl:max-h-[min(58vh,640px)] min-h-[160px] sm:min-h-[220px] md:min-h-[260px]"
                    )}
                  >
                    <WorkspaceThumbnail
                      thumbnailUrl={presentation?.thumbnailUrl}
                      name={item.name}
                      size="fill"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.01]"
                    />

                    {/* Centered Hover Launch Action Overlay */}
                    {isCenter && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200">
                        <Button
                          type="button"
                          variant="default"
                          size={terminalStage === "full" ? "sm" : "default"}
                          onClick={(e) => {
                            e.stopPropagation();
                            onLaunchWorkspace(item);
                          }}
                          className={cn(
                            "gap-2 shadow-lg focus-visible:ring-2 focus-visible:ring-ring min-h-[24px] min-w-[24px]",
                            terminalStage === "full" ? "h-7 text-xs px-2.5" : "h-9 px-4 text-xs font-semibold"
                          )}
                          aria-label={`Launch ${item.name}`}
                        >
                          <Play className="size-4 fill-current" />
                          <span>Launch</span>
                        </Button>
                      </div>
                    )}
                  </div>

                  <div
                    className={cn(
                      "flex items-center justify-between border-t border-border/80 bg-card transition-all duration-200",
                      terminalStage === "full"
                        ? "px-3 py-1.5"
                        : terminalStage === "partial"
                        ? "px-4 sm:px-5 py-2 sm:py-2.5"
                        : "px-4 sm:px-6 py-3 sm:py-4"
                    )}
                    title={item.root}
                  >
                    <WorkspaceBreadcrumbs
                      path={item.root}
                      className="pr-2 sm:pr-4"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Next Button */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={count <= 1}
          onClick={() => move(1)}
          aria-label="Next workspace"
          title="Next workspace (ArrowRight)"
          className={cn(
            "z-30 shrink-0 rounded-full border-border/80 bg-card/90 shadow-md hover:bg-accent text-foreground focus-visible:ring-2 focus-visible:ring-ring transition-all duration-200",
            terminalStage === "full"
              ? "size-8 ml-2 sm:ml-3"
              : terminalStage === "partial"
              ? "size-9 sm:size-10 ml-2 sm:ml-4"
              : "size-9 sm:size-11 ml-2 sm:ml-4 md:ml-6"
          )}
        >
          <ChevronRight className={cn(terminalStage === "full" ? "size-4" : "size-5")} />
        </Button>
      </div>

      {/* Bottom Pagination Scrubber & Counter */}
      <div
        className={cn(
          "flex flex-col items-center transition-all duration-200",
          terminalStage === "full"
            ? "mt-1.5 gap-1"
            : terminalStage === "partial"
            ? "mt-2.5 sm:mt-3 gap-1.5"
            : "mt-4 sm:mt-6 gap-2"
        )}
      >
        <div
          role="tablist"
          aria-label="Workspace pagination"
          className="flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 rounded-full bg-muted/40 border border-border/60"
        >
          {workspaces.map((ws, i) => {
            const isSelected = i === safeIndex;
            return (
              <button
                key={ws.root}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-label={`Go to slide ${i + 1}: ${ws.name}`}
                onClick={() => onSelectIndex(i)}
                className={cn(
                  "min-w-[24px] min-h-[24px] flex items-center justify-center rounded-full text-xs font-mono transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected
                    ? "bg-primary text-primary-foreground font-bold shadow-xs scale-105"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        <div className="text-xs text-muted-foreground font-mono">
          Workspace <span className="font-semibold text-foreground">{safeIndex + 1}</span> of{" "}
          <span>{count}</span>
        </div>
      </div>
    </section>
  );
}
