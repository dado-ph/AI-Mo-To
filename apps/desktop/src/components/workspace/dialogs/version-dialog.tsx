import * as React from "react";
import { useState } from "react";
import type { DesktopWorkspaceVersion } from "../../../contracts.js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "../../ui/dialog.js";
import { Button } from "../../ui/button.js";
import { Badge } from "../../ui/badge.js";
import { History, RotateCcw, Clock, GitCommit, Check, Loader2, AlertCircle } from "lucide-react";
import { cn } from "../../../lib/utils.js";

export interface VersionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceName: string;
  workspaceRoot: string;
  currentVersionId?: string | null | undefined;
  currentRevision?: number | undefined;
  versions: readonly DesktopWorkspaceVersion[];
  loading?: boolean | undefined;
  onRestore: (versionId: string) => Promise<void> | void;
  className?: string | undefined;
}

export function VersionHistoryDialog({
  open,
  onOpenChange,
  workspaceName,
  workspaceRoot,
  currentVersionId,
  currentRevision,
  versions,
  loading = false,
  onRestore,
  className
}: VersionHistoryDialogProps) {
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setRestoreError(null);
    }
  }, [open]);

  const handleRestore = async (versionId: string) => {
    setRestoringVersionId(versionId);
    setRestoreError(null);
    try {
      await onRestore(versionId);
      onOpenChange(false);
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : "Failed to restore version snapshot.");
    } finally {
      setRestoringVersionId(null);
    }
  };

  const sortedVersions = [...versions].sort((a, b) => b.revision - a.revision);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="modal" className={cn("max-w-2xl max-h-[85vh] flex flex-col p-6", className)}>
        <DialogHeader className="space-y-1 pb-3 border-b border-border/70">
          <div className="flex items-center gap-2">
            <History className="size-5 text-primary" />
            <DialogTitle className="text-xl font-bold">Version History</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Snapshots for <span className="font-semibold text-foreground">{workspaceName}</span> ({workspaceRoot})
          </DialogDescription>
        </DialogHeader>

        {restoreError && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive my-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{restoreError}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-4 space-y-3 min-h-[180px] max-h-[50vh]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="size-6 animate-spin text-primary" />
              <p className="text-sm">Loading version snapshots...</p>
            </div>
          ) : sortedVersions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground space-y-2">
              <History className="size-10 stroke-1 opacity-50" />
              <p className="font-medium text-foreground">No approved versions yet</p>
              <p className="text-xs max-w-sm">
                Approved changes and restorations capture new version snapshots automatically, ensuring continuity.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {sortedVersions.map((snapshot) => {
                const isCurrent = snapshot.versionId === currentVersionId;
                const isRestoring = restoringVersionId === snapshot.versionId;
                const formattedDate = new Date(snapshot.createdAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                });

                return (
                  <div
                    key={snapshot.versionId}
                    className={cn(
                      "flex items-center justify-between rounded-lg border p-3.5 transition-colors",
                      isCurrent
                        ? "border-primary/50 bg-primary/5 shadow-sm"
                        : "border-border bg-card/60 hover:bg-accent/40"
                    )}
                  >
                    <div className="flex flex-col gap-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="font-mono text-xs">
                          rev {snapshot.revision}
                        </Badge>
                        <span className="font-mono text-xs text-muted-foreground" title={snapshot.versionId}>
                          {snapshot.versionId.slice(0, 8)}
                        </span>
                        {isCurrent && (
                          <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4">
                            Current Active
                          </Badge>
                        )}
                      </div>

                      <p className="text-sm font-medium text-foreground truncate mt-0.5">
                        {snapshot.message || "Snapshot captured"}
                      </p>

                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {formattedDate}
                        </span>
                        {snapshot.fileManifestDigest && (
                          <span className="font-mono truncate max-w-[120px]" title={snapshot.fileManifestDigest}>
                            digest:{snapshot.fileManifestDigest.slice(0, 7)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <Button
                        type="button"
                        variant={isCurrent ? "ghost" : "outline"}
                        size="sm"
                        disabled={isCurrent || isRestoring || restoringVersionId !== null}
                        onClick={() => void handleRestore(snapshot.versionId)}
                        className="gap-1.5 min-w-[5.5rem]"
                        title={isCurrent ? "Already on this version" : "Restore this version (captures new revision)"}
                      >
                        {isRestoring ? (
                          <>
                            <Loader2 className="size-3.5 animate-spin" />
                            <span>Restoring...</span>
                          </>
                        ) : isCurrent ? (
                          <>
                            <Check className="size-3.5 text-primary" />
                            <span>Active</span>
                          </>
                        ) : (
                          <>
                            <RotateCcw className="size-3.5" />
                            <span>Restore</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-3 border-t border-border/70">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
