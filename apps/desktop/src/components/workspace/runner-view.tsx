import * as React from "react";
import { useState, useRef, useEffect } from "react";
import type { WorkspaceInspection } from "@ai-mo-to/engine";
import type { WorkspacePresentation } from "../../contracts.js";
import { WorkspaceFrame } from "./frame.js";
import { Button } from "../ui/button.js";
import { Badge } from "../ui/badge.js";
import {
  ArrowLeft,
  RefreshCw,
  FolderOpen,
  ChevronDown,
  History,
  FileCode,
  Check,
  Layers,
  Copy
} from "lucide-react";
import { cn } from "../../lib/utils.js";

export interface WorkspaceRunnerViewProps {
  workspace: WorkspaceInspection;
  allWorkspaces: WorkspaceInspection[];
  presentation?: WorkspacePresentation | undefined;
  onBack: () => void;
  onSelectWorkspace: (workspace: WorkspaceInspection) => void;
  onOpenFolder: (root: string) => void;
  onViewVersions?: ((workspace: WorkspaceInspection) => void) | undefined;
  className?: string | undefined;
}

export function WorkspaceRunnerView({
  workspace,
  allWorkspaces,
  presentation,
  onBack,
  onSelectWorkspace,
  onOpenFolder,
  onViewVersions,
  className
}: WorkspaceRunnerViewProps) {
  const [iframeKey, setIframeKey] = useState(0);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  // Close switcher on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setIsSwitcherOpen(false);
      }
    };
    if (isSwitcherOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isSwitcherOpen]);

  // Close switcher on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isSwitcherOpen) {
        setIsSwitcherOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSwitcherOpen]);

  const handleCopyPath = () => {
    void navigator.clipboard.writeText(workspace.root);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReload = () => {
    setIframeKey((prev) => prev + 1);
  };

  return (
    <main className={cn("relative flex h-screen flex-col overflow-hidden bg-background text-foreground", className)}>
      {/* Enhanced Top Toolbar */}
      <header className="relative z-30 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur">
        {/* Left: Back button & Workspace Switcher */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            title="Back to Workspaces"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Back</span>
          </Button>

          <div className="h-4 w-px bg-border/80 mx-1" />

          {/* Workspace Switcher Dropdown */}
          <div ref={switcherRef} className="relative">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsSwitcherOpen((prev) => !prev)}
              className="gap-2 font-medium max-w-[200px] sm:max-w-xs"
              title="Switch workspace"
              aria-expanded={isSwitcherOpen}
              aria-haspopup="listbox"
            >
              <Layers className="size-3.5 text-primary shrink-0" />
              <span className="truncate">{workspace.name}</span>
              <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", isSwitcherOpen && "rotate-180")} />
            </Button>

            {isSwitcherOpen && (
              <div
                role="listbox"
                aria-label="Select workspace"
                className="absolute left-0 top-full mt-1.5 w-64 rounded-xl border border-border bg-card p-1.5 shadow-xl z-50 animate-in fade-in-50 zoom-in-95 max-h-72 overflow-y-auto"
              >
                <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Switch Workspace
                </div>
                {allWorkspaces.map((ws) => {
                  const isCurrent = ws.root === workspace.root;
                  return (
                    <button
                      key={ws.root}
                      type="button"
                      role="option"
                      aria-selected={isCurrent}
                      onClick={() => {
                        onSelectWorkspace(ws);
                        setIsSwitcherOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors",
                        isCurrent
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="truncate font-medium">{ws.name}</span>
                        <span className="text-[10px] text-muted-foreground truncate">{ws.root}</span>
                      </div>
                      {isCurrent && <Check className="size-3.5 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Center / Right: Version indicator, Reload, and Folder actions */}
        <div className="flex items-center gap-2">
          {/* Version Indicator / Dialog Trigger */}
          {onViewVersions && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onViewVersions(workspace)}
              className="gap-1.5 text-xs font-mono"
              title="Inspect version history & restore snapshots"
            >
              <Badge variant="secondary" className="font-mono text-xs">
                rev {workspace.revision}
              </Badge>
              <History className="size-3.5 text-muted-foreground" />
            </Button>
          )}

          {/* Iframe Preview Reload Trigger */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReload}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            title="Reload application preview"
          >
            <RefreshCw className="size-3.5" />
            <span className="hidden md:inline">Reload</span>
          </Button>

          {/* Open in File Explorer */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onOpenFolder(workspace.root)}
            className="size-8 text-muted-foreground hover:text-foreground"
            title="Open workspace in File Explorer"
            aria-label="Open workspace folder"
          >
            <FolderOpen className="size-4" />
          </Button>
        </div>
      </header>

      {/* Main View Area */}
      <section className="relative flex-1 overflow-hidden bg-muted">
        {presentation?.entryUrl ? (
          <WorkspaceFrame
            key={`${workspace.root}-${workspace.revision}-${iframeKey}`}
            workspace={workspace}
            presentation={presentation}
          />
        ) : (
          /* Guided Missing Entrypoint Empty State */
          <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl border border-border bg-card shadow-sm mb-4">
              <FileCode className="size-8 text-primary" />
            </div>

            <h3 className="text-xl font-bold text-foreground">
              No application entrypoint found
            </h3>

            <p className="mt-2 max-w-md text-sm text-muted-foreground leading-relaxed">
              AI-Mo-To looks for <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground">index.html</code>,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground">ui/index.html</code>, or{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground">public/index.html</code> in this workspace. Run an agent or add a UI file to launch your application.
            </p>

            {/* Path Box */}
            <div className="mt-5 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm max-w-lg">
              <span className="font-mono text-muted-foreground truncate select-all">{workspace.root}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleCopyPath}
                className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
                title={copied ? "Copied!" : "Copy path"}
              >
                {copied ? <Check className="size-3 text-primary" /> : <Copy className="size-3" />}
              </Button>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => onOpenFolder(workspace.root)}
                className="gap-2"
              >
                <FolderOpen className="size-4" />
                <span>Open in File Explorer</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReload}
                className="gap-1.5"
              >
                <RefreshCw className="size-3.5" />
                <span>Check Again</span>
              </Button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
