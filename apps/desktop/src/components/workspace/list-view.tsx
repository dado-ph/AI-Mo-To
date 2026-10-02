import * as React from "react";
import { useState } from "react";
import type { WorkspaceInspection } from "@ai-mo-to/engine";
import type { WorkspacePresentation } from "../../contracts.js";
import { WorkspaceThumbnail } from "./thumbnail.js";
import { HoldToConfirmButton } from "../shared/hold-to-confirm-button.js";
import { Button } from "../ui/button.js";
import { Badge } from "../ui/badge.js";
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

export interface WorkspaceListViewProps {
  workspaces: WorkspaceInspection[];
  presentations?: Record<string, WorkspacePresentation> | undefined;
  activeWorkspaceRoot?: string | undefined;
  onLaunch: (workspace: WorkspaceInspection) => void;
  onOpenFolder?: ((root: string) => void) | undefined;
  onRename?: ((root: string, newName: string) => Promise<void> | void) | undefined;
  onDelete?: ((root: string) => Promise<void> | void) | undefined;
  onViewVersions?: ((workspace: WorkspaceInspection) => void) | undefined;
  className?: string | undefined;
}

export function WorkspaceListView({
  workspaces,
  presentations,
  activeWorkspaceRoot,
  onLaunch,
  onOpenFolder,
  onRename,
  onDelete,
  onViewVersions,
  className
}: WorkspaceListViewProps) {
  const [copiedRoot, setCopiedRoot] = useState<string | null>(null);
  const [renamingRoot, setRenamingRoot] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  const handleCopyPath = (root: string) => {
    void navigator.clipboard.writeText(root);
    setCopiedRoot(root);
    setTimeout(() => setCopiedRoot(null), 2000);
  };

  const handleStartRename = (ws: WorkspaceInspection) => {
    setRenamingRoot(ws.root);
    setEditName(ws.name);
  };

  const handleCancelRename = () => {
    setRenamingRoot(null);
    setEditName("");
  };

  const handleSaveRename = async (root: string) => {
    const trimmed = editName.trim();
    const current = workspaces.find((w) => w.root === root);
    if (!trimmed || !onRename || trimmed === current?.name) {
      handleCancelRename();
      return;
    }

    setIsRenaming(true);
    try {
      await onRename(root, trimmed);
      setRenamingRoot(null);
      setEditName("");
    } catch {
      // Keep edit state on error
    } finally {
      setIsRenaming(false);
    }
  };

  return (
    <div className={cn("w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm", className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <th scope="col" className="py-3 px-4 w-12 text-center">
                Preview
              </th>
              <th scope="col" className="py-3 px-4 min-w-[180px]">
                Workspace Name
              </th>
              <th scope="col" className="py-3 px-4 w-28">
                Revision
              </th>
              <th scope="col" className="py-3 px-4 min-w-[260px]">
                Directory Location
              </th>
              <th scope="col" className="py-3 px-4 text-right min-w-[240px]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {workspaces.map((ws) => {
              const isActive = ws.root === activeWorkspaceRoot;
              const presentation = presentations?.[ws.root];
              const isCopied = copiedRoot === ws.root;
              const isEditingThis = renamingRoot === ws.root;

              return (
                <tr
                  key={ws.root}
                  className={cn(
                    "group transition-colors hover:bg-muted/40",
                    isActive && "bg-primary/5 hover:bg-primary/10"
                  )}
                >
                  {/* Thumbnail Avatar */}
                  <td className="py-2.5 px-4 text-center">
                    <div
                      className="size-9 rounded-md overflow-hidden shrink-0 border border-border/60 mx-auto cursor-pointer"
                      onClick={() => onLaunch(ws)}
                      title={`Launch ${ws.name}`}
                    >
                      <WorkspaceThumbnail
                        thumbnailUrl={presentation?.thumbnailUrl}
                        name={ws.name}
                        size="sm"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </td>

                  {/* Workspace Name & Inline Rename */}
                  <td className="py-2.5 px-4 font-medium text-foreground">
                    {isEditingThis ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void handleSaveRename(ws.root);
                        }}
                        className="flex items-center gap-1.5 max-w-xs"
                      >
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
                        />
                        <Button
                          type="submit"
                          variant="default"
                          size="sm"
                          disabled={isRenaming || !editName.trim()}
                          className="h-7 min-w-[24px] min-h-[24px] px-2 text-xs"
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
                          className="h-7 min-w-[24px] min-h-[24px] px-2 text-xs"
                          title="Cancel"
                        >
                          <X className="size-3" />
                        </Button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onLaunch(ws)}
                          className="font-semibold text-foreground hover:text-primary transition-colors text-left truncate max-w-[200px] min-h-[24px] inline-flex items-center"
                          title={ws.name}
                        >
                          {ws.name}
                        </button>

                        {isActive && (
                          <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 shrink-0 font-semibold">
                            Active
                          </Badge>
                        )}

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleStartRename(ws)}
                          className="size-6 min-w-[24px] min-h-[24px] text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-opacity"
                          title="Rename workspace"
                          aria-label={`Rename ${ws.name}`}
                        >
                          <Pencil className="size-3" />
                        </Button>
                      </div>
                    )}
                  </td>

                  {/* Revision Count Badge */}
                  <td className="py-2.5 px-4">
                    <Badge variant="secondary" className="font-mono text-xs">
                      rev {ws.revision}
                    </Badge>
                  </td>

                  {/* Filesystem Path with Copy and Reveal */}
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-1.5 max-w-sm rounded border border-border/40 bg-muted/30 px-2 py-1 text-xs">
                      <span className="font-mono text-[11px] text-muted-foreground truncate select-all flex-1" title={ws.root}>
                        {ws.root}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopyPath(ws.root)}
                        className="size-6 min-h-[24px] min-w-[24px] shrink-0 text-muted-foreground hover:text-foreground"
                        title={isCopied ? "Path copied!" : "Copy path"}
                        aria-label="Copy path"
                      >
                        {isCopied ? <Check className="size-3 text-primary" /> : <Copy className="size-3" />}
                      </Button>
                      {onOpenFolder && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => onOpenFolder(ws.root)}
                          className="size-6 min-h-[24px] min-w-[24px] shrink-0 text-muted-foreground hover:text-foreground"
                          title="Open in File Explorer"
                          aria-label="Open folder"
                        >
                          <FolderOpen className="size-3" />
                        </Button>
                      )}
                    </div>
                  </td>

                  {/* Actions Column */}
                  <td className="py-2.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={() => onLaunch(ws)}
                        className="h-8 min-h-[24px] min-w-[24px] gap-1 px-3 text-xs"
                      >
                        <Play className="size-3.5 fill-current" />
                        <span>Launch</span>
                      </Button>

                      {onViewVersions && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onViewVersions(ws)}
                          className="h-8 min-h-[24px] min-w-[24px] gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                          title="Version history"
                        >
                          <History className="size-3.5" />
                          <span className="hidden lg:inline">Versions</span>
                        </Button>
                      )}

                      {onDelete && (
                        <HoldToConfirmButton
                          onConfirm={() => void onDelete(ws.root)}
                          disabled={isActive}
                          label="Delete"
                          holdingLabel="Deleting"
                          size="sm"
                          className="h-8 min-h-[24px] min-w-[24px] text-xs px-2.5"
                          title={isActive ? "Cannot delete currently active workspace" : "Hold 1s to delete"}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
