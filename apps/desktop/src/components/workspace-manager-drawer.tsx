import React, { useState, useRef } from "react";
import type { WorkspaceInspection } from "@ai-mo-to/engine";
import type { DesktopWorkspaceVersion } from "../contracts.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog.js";
import { Button } from "./ui/button.js";
import { Badge } from "./ui/badge.js";
import {
  FolderOpen,
  Plus,
  RefreshCw,
  Pencil,
  Trash2,
  History,
  Copy,
  Check,
  ExternalLink,
  Layers,
  Folder,
  Search,
  RotateCcw,
  Settings,
  ChevronLeft,
  Moon,
  Sun
} from "lucide-react";

interface WorkspaceManagerDrawerProps {
  activeWorkspace?: WorkspaceInspection | undefined;
  workspaces: WorkspaceInspection[];
  onSelectWorkspace: (workspace: WorkspaceInspection) => void;
  onRefreshWorkspaces: () => Promise<void>;
  onImportWorkspace: () => Promise<void>;
  isDark: boolean;
  onToggleTheme: () => void;
}

/** Interactive Hold-to-Confirm Button for safety on destructive operations */
function HoldToConfirmButton({
  onConfirm,
  label = "Delete",
  className = ""
}: {
  onConfirm: () => void;
  label?: string;
  className?: string;
}) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  const startHold = () => {
    setHolding(true);
    setProgress(0);
    const startTime = Date.now();
    const duration = 1000; // 1 second hold threshold

    intervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / duration) * 100);
      setProgress(pct);
    }, 20);

    timerRef.current = window.setTimeout(() => {
      endHold();
      onConfirm();
    }, duration);
  };

  const endHold = () => {
    setHolding(false);
    setProgress(0);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  return (
    <button
      type="button"
      onMouseDown={startHold}
      onMouseUp={endHold}
      onMouseLeave={endHold}
      onTouchStart={startHold}
      onTouchEnd={endHold}
      className={`relative overflow-hidden rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
        holding
          ? "bg-destructive/90 text-destructive-foreground scale-95"
          : "bg-destructive/10 text-destructive hover:bg-destructive/20"
      } ${className}`}
      title="Press and hold to confirm action"
    >
      {holding && (
        <span
          className="absolute inset-y-0 left-0 bg-destructive/40 transition-all duration-75"
          style={{ width: `${progress}%` }}
        />
      )}
      <span className="relative z-10 flex items-center gap-1">
        <Trash2 className="size-3" />
        {holding ? `${Math.round(progress)}%` : label}
      </span>
    </button>
  );
}

export function WorkspaceManagerDrawer({
  activeWorkspace,
  workspaces,
  onSelectWorkspace,
  onRefreshWorkspaces,
  onImportWorkspace,
  isDark,
  onToggleTheme
}: WorkspaceManagerDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isActionsExpanded, setIsActionsExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);

  // Creation form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Rename form state
  const [renamingRoot, setRenamingRoot] = useState<string | null>(null);
  const [renamedName, setRenamedName] = useState("");

  const [viewingVersionsRoot, setViewingVersionsRoot] = useState<string | null>(null);
  const [versions, setVersions] = useState<readonly DesktopWorkspaceVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  const api = window.aimoto;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshWorkspaces();
    } finally {
      setIsRefreshing(false);
    }
  };

  const copyPathToClipboard = (path: string) => {
    void navigator.clipboard.writeText(path);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2000);
  };

  const handleOpenFolder = (root: string) => {
    if (api?.openWorkspaceFolder) {
      void api.openWorkspaceFolder(root);
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim() || !api?.createWorkspace) return;
    setIsCreating(true);
    try {
      const created = await api.createWorkspace(newWorkspaceName.trim());
      setNewWorkspaceName("");
      setShowCreateForm(false);
      await onRefreshWorkspaces();
      onSelectWorkspace(created);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRenameWorkspace = async (root: string) => {
    if (!renamedName.trim() || !api?.renameWorkspace) return;
    try {
      const updated = await api.renameWorkspace(root, renamedName.trim());
      setRenamingRoot(null);
      setRenamedName("");
      await onRefreshWorkspaces();
      if (activeWorkspace?.root === root) {
        onSelectWorkspace(updated);
      }
    } catch {}
  };

  const handleDeleteWorkspace = async (root: string) => {
    if (!api?.deleteWorkspace) return;
    try {
      await api.deleteWorkspace(root);
      await onRefreshWorkspaces();
    } catch {}
  };

  const handleLoadVersions = async (root: string) => {
    if (!api?.listWorkspaceVersions) return;
    setViewingVersionsRoot(root);
    setLoadingVersions(true);
    try {
      setVersions(await api.listWorkspaceVersions(root));
    } catch {
      setVersions([]);
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleRestoreVersion = async (root: string, versionId: string) => {
    if (!api?.restoreWorkspaceVersion) return;
    try {
      await api.restoreWorkspaceVersion(root, versionId);
      setViewingVersionsRoot(null);
      await onRefreshWorkspaces();
      if (activeWorkspace?.root === root) {
        onSelectWorkspace(await api.inspectWorkspace(root));
      }
    } catch {}
  };

  const filteredWorkspaces = workspaces.filter(
    (ws) =>
      ws.name.toLowerCase().includes(search.toLowerCase()) ||
      ws.root.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex w-40 justify-end">
        <div className={`flex items-center overflow-hidden rounded-full border border-border bg-card shadow-sm transition-[width,padding] duration-300 ${isActionsExpanded ? "w-40 p-1" : "w-10 p-1"}`}>
          <div className={`flex shrink-0 items-center gap-1 overflow-hidden transition-[width,margin,opacity,transform] duration-300 ${isActionsExpanded ? "mr-1 w-[6.5rem] translate-x-0 opacity-100" : "pointer-events-none w-0 translate-x-3 opacity-0"}`}>
            <Button variant="ghost" size="icon" className="size-8 shrink-0 rounded-full" onClick={() => setIsActionsExpanded(false)} aria-label="Collapse workspace actions" title="Collapse actions">
              <ChevronLeft className="size-4" />
            </Button>
          <Button variant="ghost" size="icon" className="size-8 shrink-0 rounded-full" onClick={onToggleTheme} aria-label={isDark ? "Use light mode" : "Use dark mode"} title={isDark ? "Use light mode" : "Use dark mode"}>
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
            <Button variant="ghost" size="icon" className="size-8 shrink-0 rounded-full" onClick={() => setIsOpen(true)} aria-label={`Open workspaces (${workspaces.length})`} title="Workspaces">
              <Layers className="size-4 text-primary" />
            </Button>
          </div>
          <Button variant="ghost" size="icon" className="size-8 shrink-0 rounded-full text-foreground hover:bg-accent" onClick={() => setIsActionsExpanded(value => !value)} aria-label={isActionsExpanded ? "Collapse workspace actions" : "Open workspace actions"} title="Workspace actions">
            <Settings aria-hidden="true" className={`aimoto-cog size-4 text-foreground transition-transform duration-300 ${isActionsExpanded ? "rotate-90" : "rotate-0"}`} />
          </Button>
        </div>
      </div>

      <DialogContent className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border/80 bg-background/95 p-0 shadow-2xl backdrop-blur-lg">
        {/* Drawer Header */}
        <DialogHeader className="border-b border-border/60 p-5 pb-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="aimoto-display flex items-center gap-2 text-xl font-bold">
              <Layers className="size-5 text-primary" /> Workspace Manager
            </DialogTitle>

            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-full"
              onClick={() => void handleRefresh()}
              title="Reload workspaces from disk & registry"
            >
              <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
            </Button>
          </div>

          {/* Active Workspace Location Card */}
          {activeWorkspace && (
            <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
              <div className="flex items-center justify-between gap-2 text-muted-foreground font-mono text-[11px] mb-1">
                <span>ACTIVE WORKSPACE LOCATION</span>
                <span className="text-primary font-semibold">{activeWorkspace.name}</span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px] text-foreground bg-background/60 p-2 rounded border border-border/40 truncate">
                <Folder className="size-3.5 shrink-0 text-primary" />
                <span className="truncate flex-1" title={activeWorkspace.root}>
                  {activeWorkspace.root}
                </span>
                <button
                  onClick={() => copyPathToClipboard(activeWorkspace.root)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                  title="Copy directory path"
                >
                  {copiedPath ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
                </button>
                <button
                  onClick={() => handleOpenFolder(activeWorkspace.root)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                  title="Open in File Explorer"
                >
                  <ExternalLink className="size-3" />
                </button>
              </div>
            </div>
          )}
        </DialogHeader>

        {/* Toolbar & Creation */}
        <div className="flex flex-col gap-3 px-5 py-3 border-b border-border/40 bg-muted/20">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search workspaces..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-input bg-background/80 py-1.5 pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => setShowCreateForm((v) => !v)}
            >
              <Plus className="size-3.5" /> New
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => void onImportWorkspace()}
              title="Select folder from filesystem"
            >
              <FolderOpen className="size-3.5" /> Open
            </Button>
          </div>

          {showCreateForm && (
            <form onSubmit={handleCreateWorkspace} className="flex gap-2 pt-2 border-t border-border/40">
              <input
                type="text"
                placeholder="Workspace name (e.g. My Project)"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
              <Button type="submit" size="sm" disabled={isCreating || !newWorkspaceName.trim()}>
                {isCreating ? "Creating..." : "Create"}
              </Button>
            </form>
          )}
        </div>

        {/* Workspace Card List */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {filteredWorkspaces.length === 0 ? (
            <div className="text-center py-10 text-xs text-muted-foreground">
              No workspaces found. Click <strong>New</strong> or <strong>Open</strong> to start.
            </div>
          ) : (
            filteredWorkspaces.map((ws) => {
              const isActive = activeWorkspace?.root === ws.root;
              const isRenaming = renamingRoot === ws.root;

              return (
                <div
                  key={ws.root}
                  className={`group relative rounded-xl border p-4 transition-all duration-200 ${
                    isActive
                      ? "border-primary/80 bg-primary/5 shadow-md"
                      : "border-border/60 bg-card/60 hover:border-border hover:bg-card"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                        {ws.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        {isRenaming ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={renamedName}
                              onChange={(e) => setRenamedName(e.target.value)}
                              className="rounded border bg-background px-2 py-0.5 text-xs font-semibold"
                              autoFocus
                            />
                            <button
                              onClick={() => void handleRenameWorkspace(ws.root)}
                              className="p-1 text-green-500 hover:text-green-400"
                            >
                              <Check className="size-3.5" />
                            </button>
                          </div>
                        ) : (
                          <h4 className="aimoto-display text-sm font-semibold text-foreground flex items-center gap-2">
                            {ws.name}
                            {isActive && (
                              <Badge className="bg-primary/20 text-primary hover:bg-primary/30 text-[9px] px-1.5 py-0">
                                ACTIVE
                              </Badge>
                            )}
                          </h4>
                        )}
                        <p className="text-[11px] text-muted-foreground font-mono truncate max-w-[220px]" title={ws.root}>
                          {ws.root}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-[10px] font-mono">
                        rev {ws.revision}
                      </Badge>
                    </div>
                  </div>

                  <div className="mb-3 text-[11px] text-muted-foreground">
                    {ws.currentVersionId ? `Current version: ${ws.currentVersionId}` : "No approved versions yet"}
                  </div>

                  {/* Interactive Action Bar */}
                  <div className="flex items-center justify-between border-t border-border/40 pt-2.5">
                    <div className="flex items-center gap-1">
                      {!isActive && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-2.5"
                          onClick={() => {
                            onSelectWorkspace(ws);
                            setIsOpen(false);
                          }}
                        >
                          Switch
                        </Button>
                      )}
                      <button
                        onClick={() => handleOpenFolder(ws.root)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                        title="Reveal in Explorer"
                      >
                        <FolderOpen className="size-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setRenamingRoot(ws.root);
                          setRenamedName(ws.name);
                        }}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                        title="Rename Workspace"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        onClick={() => void handleLoadVersions(ws.root)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                        title="View Versions & Restore"
                      >
                        <History className="size-3.5" />
                      </button>
                    </div>

                    {!isActive && (
                      <HoldToConfirmButton
                        onConfirm={() => void handleDeleteWorkspace(ws.root)}
                        label="Unregister"
                      />
                    )}
                  </div>

                  {viewingVersionsRoot === ws.root && (
                    <div className="mt-3 rounded-lg border border-border/80 bg-background/80 p-3 text-xs space-y-2">
                      <div className="flex items-center justify-between font-semibold">
                        <span className="flex items-center gap-1 text-primary">
                          <RotateCcw className="size-3.5" /> Versions / Restore
                        </span>
                        <button
                          onClick={() => setViewingVersionsRoot(null)}
                          className="text-muted-foreground hover:text-foreground text-[10px]"
                        >
                          Close
                        </button>
                      </div>

                      {loadingVersions ? (
                        <div className="text-muted-foreground py-2 text-[11px]">Loading versions...</div>
                      ) : versions.length === 0 ? (
                        <div className="text-muted-foreground py-1 text-[11px]">No approved versions yet.</div>
                      ) : (
                        <div className="space-y-1 max-h-36 overflow-y-auto">
                          {versions.map((version) => (
                            <div
                              key={version.versionId}
                              className="flex items-center justify-between rounded bg-muted/40 p-1.5 font-mono text-[11px]"
                            >
                              <div>
                                <span className="font-semibold text-foreground">rev {version.revision}</span>
                                <span className="ml-2 text-muted-foreground text-[10px]">
                                  {version.message}
                                </span>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-[10px] px-2"
                                onClick={() => void handleRestoreVersion(ws.root, version.versionId)}
                              >
                                Restore
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
