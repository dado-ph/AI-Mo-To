import * as React from "react";
import { useState } from "react";
import type { WorkspaceInspection } from "@ai-mo-to/engine";
import type { WorkspacePresentation } from "../../contracts.js";
import { WorkspaceThumbnail } from "./thumbnail.js";
import { WorkspaceBreadcrumbs } from "./breadcrumbs.js";
import { HoldToConfirmButton } from "../shared/hold-to-confirm-button.js";
import { Button } from "../ui/button.js";
import { Badge } from "../ui/badge.js";
import { Card } from "../ui/card.js";
import { Input } from "../ui/input.js";
import {
  FolderOpen,
  Copy,
  Check,
  History,
  Pencil,
  Play,
  X
} from "lucide-react";
import { cn } from "../../lib/utils.js";

export interface WorkspaceCardProps {
  workspace: WorkspaceInspection;
  presentation?: WorkspacePresentation | undefined;
  isActive?: boolean | undefined;
  onLaunch: (workspace: WorkspaceInspection) => void;
  onOpenFolder?: ((root: string) => void) | undefined;
  onRename?: ((root: string, newName: string) => Promise<void> | void) | undefined;
  onDelete?: ((root: string) => Promise<void> | void) | undefined;
  onViewVersions?: ((workspace: WorkspaceInspection) => void) | undefined;
  className?: string | undefined;
}

export function WorkspaceCard({
  workspace,
  presentation,
  isActive = false,
  onLaunch,
  onOpenFolder,
  onRename,
  onDelete,
  onViewVersions,
  className
}: WorkspaceCardProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(workspace.name);
  const [isRenaming, setIsRenaming] = useState(false);

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(workspace.root);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditName(workspace.name);
    setIsEditing(true);
  };

  const handleCancelRename = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsEditing(false);
    setEditName(workspace.name);
  };

  const handleSaveRename = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const trimmed = editName.trim();
    if (!trimmed || trimmed === workspace.name || !onRename) {
      setIsEditing(false);
      return;
    }

    setIsRenaming(true);
    try {
      await onRename(workspace.root, trimmed);
      setIsEditing(false);
    } catch {
      // Keep edit state on error
    } finally {
      setIsRenaming(false);
    }
  };

  return (
    <Card
      className={cn(
        "relative flex flex-col overflow-hidden transition-all duration-200 hover:border-primary/50 hover:shadow-md",
        isActive && "ring-1 ring-primary/40 border-primary/50",
        className
      )}
    >
      {/* Top Preview Thumbnail Area */}
      <div className="group relative aspect-video w-full overflow-hidden bg-muted">
        <WorkspaceThumbnail
          thumbnailUrl={presentation?.thumbnailUrl}
          name={workspace.name}
          size="fill"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />

        {/* Centered Hover Launch Action Overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onLaunch(workspace);
            }}
            className="gap-2 shadow-lg focus-visible:ring-2 focus-visible:ring-ring min-h-[24px] min-w-[24px]"
            aria-label={`Launch ${workspace.name}`}
          >
            <Play className="size-4 fill-current" />
            <span>Launch</span>
          </Button>
        </div>

        {/* Status Badge */}
        {isActive && (
          <div className="absolute top-2.5 left-2.5 pointer-events-none">
            <Badge variant="default" className="text-[10px] px-2 py-0.5 shadow-sm font-semibold">
              Active
            </Badge>
          </div>
        )}

        <span className="sr-only">rev {workspace.revision}</span>
      </div>

      {/* Card Content */}
      <div className="flex flex-1 flex-col p-4 space-y-3">
        {/* Workspace Title & Inline Rename */}
        <div className="flex items-center justify-between gap-2 min-h-[2rem]">
          {isEditing ? (
            <form onSubmit={handleSaveRename} className="flex flex-1 items-center gap-1.5">
              <Input
                size={1}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                autoFocus
                disabled={isRenaming}
                onKeyDown={(e) => {
                  if (e.key === "Escape") handleCancelRename();
                }}
                className="h-7 text-xs px-2"
                placeholder="Workspace name"
              />
              <Button
                type="submit"
                variant="default"
                size="sm"
                disabled={isRenaming || !editName.trim()}
                className="h-7 px-2 text-xs"
                title="Save name"
              >
                <Check className="size-3" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isRenaming}
                onClick={handleCancelRename}
                className="h-7 px-2 text-xs"
                title="Cancel"
              >
                <X className="size-3" />
              </Button>
            </form>
          ) : (
            <>
              <h3
                className="font-semibold text-base tracking-tight truncate text-foreground"
                title={workspace.name}
              >
                {workspace.name}
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleStartRename}
                className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                title="Rename workspace"
                aria-label={`Rename ${workspace.name}`}
              >
                <Pencil className="size-3.5" />
              </Button>
            </>
          )}
        </div>

        {/* Breadcrumb Filesystem Path */}
        <div
          className="flex items-center justify-between gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5 text-xs min-w-0"
          title={workspace.root}
        >
          <WorkspaceBreadcrumbs
            path={workspace.root}
            className="flex-1"
          />
          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleCopyPath}
              className="size-6 min-h-[24px] min-w-[24px] text-muted-foreground hover:text-foreground"
              title={copied ? "Path copied to clipboard" : "Copy path to clipboard"}
              aria-label="Copy workspace path"
            >
              {copied ? <Check className="size-3 text-primary" /> : <Copy className="size-3" />}
            </Button>
            {onOpenFolder && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenFolder(workspace.root);
                }}
                className="size-6 min-h-[24px] min-w-[24px] text-muted-foreground hover:text-foreground"
                title="Open in File Explorer"
                aria-label="Open in File Explorer"
              >
                <FolderOpen className="size-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Actions Toolbar at Bottom */}
        <div className="mt-auto pt-2 flex items-center justify-between gap-2 border-t border-border/60">
          <div className="flex items-center gap-1.5">
            {onViewVersions && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onViewVersions(workspace)}
                className="h-8 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground min-h-[24px] min-w-[24px]"
                title="Inspect version history"
              >
                <History className="size-3.5" />
                <span className="hidden sm:inline">Versions</span>
              </Button>
            )}
          </div>

          {onDelete && (
            <HoldToConfirmButton
              onConfirm={() => void onDelete(workspace.root)}
              disabled={isActive}
              label="Delete"
              holdingLabel="Deleting"
              size="sm"
              className="h-8 text-xs px-2.5"
              title={isActive ? "Cannot delete currently active workspace" : "Hold 1s to unregister workspace"}
            />
          )}
        </div>
      </div>
    </Card>
  );
}
