import * as React from "react";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";
import {
  Search,
  X,
  LayoutGrid,
  List,
  GalleryHorizontal,
  Plus,
  FolderOpen,
  Sun,
  Moon
} from "lucide-react";
import { cn } from "../../lib/utils.js";

export interface HeaderNavigationProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  viewMode: "carousel" | "grid" | "list";
  onViewModeChange: (mode: "carousel" | "grid" | "list") => void;
  onNewWorkspace: () => void;
  onImportWorkspace: () => Promise<void> | void;
  isDark: boolean;
  onToggleTheme: () => void;
  workspaceCount?: number | undefined;
  className?: string | undefined;
  appIconUrl?: string | undefined;
}

export function HeaderNavigation({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  onNewWorkspace,
  onImportWorkspace,
  isDark,
  onToggleTheme,
  workspaceCount,
  className,
  appIconUrl
}: HeaderNavigationProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-border bg-background/85 px-4 md:px-6 backdrop-blur transition-colors",
        className
      )}
    >
      {/* Brand & Wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        {appIconUrl ? (
          <img src={appIconUrl} alt="" className="size-8 object-contain" />
        ) : (
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm shadow-sm select-none">
            AI
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="aimoto-wordmark font-bold tracking-wider text-foreground select-none">
            AIMOTO
          </span>
          {typeof workspaceCount === "number" && (
            <span className="hidden sm:inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-mono font-medium text-muted-foreground">
              {workspaceCount}
            </span>
          )}
        </div>
      </div>

      {/* Real-Time Search Bar */}
      <div className="mx-4 flex flex-1 max-w-md items-center">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search workspaces..."
            aria-label="Search workspaces"
            className="h-9 w-full rounded-full pl-9 pr-8 bg-muted/40 border-border/80 text-xs focus-visible:bg-background transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search query"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Controls & Actions */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* View Mode Segmented Controls */}
        <div
          role="group"
          aria-label="View mode"
          className="flex items-center rounded-lg border border-border/80 bg-muted/40 p-0.5"
        >
          <Button
            type="button"
            variant={viewMode === "carousel" ? "default" : "ghost"}
            size="icon"
            onClick={() => onViewModeChange("carousel")}
            className="size-7 rounded-md"
            title="Adaptive Carousel View"
            aria-label="Carousel view"
            aria-pressed={viewMode === "carousel"}
          >
            <GalleryHorizontal className="size-3.5" />
          </Button>

          <Button
            type="button"
            variant={viewMode === "grid" ? "default" : "ghost"}
            size="icon"
            onClick={() => onViewModeChange("grid")}
            className="size-7 rounded-md"
            title="Card Grid View"
            aria-label="Grid view"
            aria-pressed={viewMode === "grid"}
          >
            <LayoutGrid className="size-3.5" />
          </Button>

          <Button
            type="button"
            variant={viewMode === "list" ? "default" : "ghost"}
            size="icon"
            onClick={() => onViewModeChange("list")}
            className="size-7 rounded-md"
            title="Compact List View"
            aria-label="List view"
            aria-pressed={viewMode === "list"}
          >
            <List className="size-3.5" />
          </Button>
        </div>

        <div className="h-4 w-px bg-border/80 hidden sm:block" />

        {/* Primary Action Buttons */}
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={onNewWorkspace}
          className="h-8 gap-1.5 px-3 text-xs shadow-sm"
          title="Create a new agent workspace"
        >
          <Plus className="size-3.5" />
          <span className="hidden sm:inline">New Workspace</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void onImportWorkspace()}
          className="h-8 gap-1.5 px-3 text-xs"
          title="Import an existing directory from disk"
        >
          <FolderOpen className="size-3.5" />
          <span className="hidden sm:inline">Import</span>
        </Button>

        {/* Quick Theme Toggle Button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggleTheme}
          className="size-8 text-foreground"
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? <Sun className="size-4 text-amber-400" /> : <Moon className="size-4" />}
        </Button>
      </div>
    </header>
  );
}
