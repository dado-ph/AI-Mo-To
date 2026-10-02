import * as React from "react";
import type { WorkspaceInspection } from "@ai-mo-to/engine";
import type { WorkspacePresentation } from "../../contracts.js";
import { WorkspaceCard } from "./card.js";
import { WorkspaceListView } from "./list-view.js";
import { Button } from "../ui/button.js";
import { SearchX, FolderPlus, FolderOpen } from "lucide-react";
import { cn } from "../../lib/utils.js";

export interface WorkspaceHubProps {
  workspaces: WorkspaceInspection[];
  viewMode: "grid" | "list";
  presentations?: Record<string, WorkspacePresentation> | undefined;
  activeWorkspaceRoot?: string | undefined;
  searchQuery?: string | undefined;
  onClearSearch?: (() => void) | undefined;
  onNewWorkspace?: (() => void) | undefined;
  onImportWorkspace?: (() => Promise<void> | void) | undefined;
  onLaunch: (workspace: WorkspaceInspection) => void;
  onOpenFolder?: ((root: string) => void) | undefined;
  onRename?: ((root: string, newName: string) => Promise<void> | void) | undefined;
  onDelete?: ((root: string) => Promise<void> | void) | undefined;
  onViewVersions?: ((workspace: WorkspaceInspection) => void) | undefined;
  className?: string | undefined;
}

export function WorkspaceHub({
  workspaces,
  viewMode,
  presentations,
  activeWorkspaceRoot,
  searchQuery,
  onClearSearch,
  onNewWorkspace,
  onImportWorkspace,
  onLaunch,
  onOpenFolder,
  onRename,
  onDelete,
  onViewVersions,
  className
}: WorkspaceHubProps) {
  // Empty states
  if (workspaces.length === 0) {
    if (searchQuery && searchQuery.trim().length > 0) {
      return (
        <div className={cn("flex flex-col items-center justify-center py-20 px-4 text-center", className)}>
          <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/60 border border-border/80 shadow-inner mb-4">
            <SearchX className="size-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-bold text-foreground">No workspaces found</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-5">
            No workspaces matched your search for{" "}
            <span className="font-semibold text-foreground">"{searchQuery}"</span>.
          </p>
          {onClearSearch && (
            <Button type="button" variant="outline" size="sm" onClick={onClearSearch}>
              Clear Search Query
            </Button>
          )}
        </div>
      );
    }

    return (
      <div className={cn("flex flex-col items-center justify-center py-20 px-4 text-center", className)}>
        <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 shadow-inner mb-4">
          <FolderPlus className="size-8 text-primary" />
        </div>
        <h3 className="text-xl font-bold text-foreground">No workspaces yet</h3>
        <p className="text-sm text-muted-foreground max-w-md mt-1 mb-6">
          Create an independent, version-tracked workspace or import an existing directory to launch your agents.
        </p>
        <div className="flex items-center gap-3">
          {onNewWorkspace && (
            <Button type="button" variant="default" size="sm" onClick={onNewWorkspace} className="gap-1.5">
              <FolderPlus className="size-4" />
              <span>Create Workspace</span>
            </Button>
          )}
          {onImportWorkspace && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void onImportWorkspace()}
              className="gap-1.5"
            >
              <FolderOpen className="size-4" />
              <span>Import Folder</span>
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("w-full max-w-[1500px] mx-auto px-4 sm:px-6 py-6", className)}>
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {workspaces.map((ws) => (
            <WorkspaceCard
              key={ws.root}
              workspace={ws}
              presentation={presentations?.[ws.root]}
              isActive={ws.root === activeWorkspaceRoot}
              onLaunch={onLaunch}
              onOpenFolder={onOpenFolder}
              onRename={onRename}
              onDelete={onDelete}
              onViewVersions={onViewVersions}
            />
          ))}
        </div>
      ) : (
        <WorkspaceListView
          workspaces={workspaces}
          presentations={presentations}
          activeWorkspaceRoot={activeWorkspaceRoot}
          onLaunch={onLaunch}
          onOpenFolder={onOpenFolder}
          onRename={onRename}
          onDelete={onDelete}
          onViewVersions={onViewVersions}
        />
      )}
    </div>
  );
}
