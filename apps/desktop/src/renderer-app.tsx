import "./renderer.css";
import "../../../packages/ui-primitives/src/tokens.css";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Maximize2, Minimize2, Minus, Plus, X } from "lucide-react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { WorkspaceInspection } from "@ai-mo-to/engine";
import type { DesktopWorkspaceVersion, WorkspacePresentation } from "./contracts.js";
import { HeaderNavigation } from "./components/layout/header-navigation.js";
import {
  AdaptiveCarousel,
  CreateWorkspaceDialog,
  VersionHistoryDialog,
  WorkspaceHub,
  WorkspaceRunnerView,
} from "./components/workspace/index.js";
import { cn } from "./lib/utils.js";

const api = window.aimoto;
const appIcon = new URL("../build/icon.png", import.meta.url).href;

interface TerminalTab {
  id: string;
  sessionId: string;
  label: string;
}

function getTerminalTheme(): ITheme {
  const css = getComputedStyle(document.documentElement);
  const token = (name: string) => css.getPropertyValue(name).trim();
  return {
    background: token("--terminal-background"),
    foreground: token("--terminal-foreground"),
    cursor: token("--terminal-cursor"),
    cursorAccent: token("--terminal-background"),
    selectionBackground: token("--terminal-selection"),
    black: token("--terminal-background"),
    brightBlack: token("--muted-foreground"),
    red: "#df4f5f",
    brightRed: "#ff7280",
    green: token("--primary"),
    brightGreen: "#7df0ac",
    yellow: "#d7a941",
    brightYellow: "#f2ca66",
    blue: "#5798e8",
    brightBlue: "#86baff",
    magenta: "#bb7ae5",
    brightMagenta: "#d5a8fa",
    cyan: "#4fb9c7",
    brightCyan: "#80d7e2",
    white: token("--terminal-foreground"),
    brightWhite: token("--foreground")
  };
}

export function getInitialTheme(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // Clear legacy auto-persisted dark mode from pre-redesign versions
    if (localStorage.getItem("aimoto-theme-v2") !== "true") {
      localStorage.setItem("aimoto-theme-v2", "true");
      const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
      if (!systemDark) {
        localStorage.removeItem("aimoto-theme");
      }
    }
    const stored = localStorage.getItem("aimoto-theme");
    if (stored === "dark") return true;
    if (stored === "light") return false;
  } catch {}
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
}

function getInitialViewMode(): "carousel" | "grid" | "list" {
  if (typeof window === "undefined") return "carousel";
  try {
    const stored = localStorage.getItem("aimoto-view-mode");
    if (stored === "carousel" || stored === "grid" || stored === "list") {
      return stored;
    }
  } catch {}
  return "carousel";
}

function App() {
  const [workspace, setWorkspace] = useState<WorkspaceInspection>();
  const [workspaces, setWorkspaces] = useState<WorkspaceInspection[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [presentations, setPresentations] = useState<Record<string, WorkspacePresentation>>({});
  const [terminalStage, setTerminalStage] = useState<"hidden" | "partial" | "full">("hidden");
  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string>();
  const [terminalError, setTerminalError] = useState<string>();
  const [isDark, setIsDark] = useState<boolean>(getInitialTheme);
  const [viewMode, setViewMode] = useState<"carousel" | "grid" | "list">(getInitialViewMode);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [versionHistoryWorkspace, setVersionHistoryWorkspace] = useState<WorkspaceInspection | undefined>();
  const [versions, setVersions] = useState<readonly DesktopWorkspaceVersion[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  const terminalHosts = useRef(new Map<string, HTMLDivElement>());
  const terminals = useRef(new Map<string, { terminal: Terminal; fit: FitAddon; sessionId: string }>());
  const pendingOutput = useRef(new Map<string, string[]>());
  const terminalTabsRef = useRef<TerminalTab[]>([]);
  const terminalVisible = terminalStage !== "hidden";

  const refreshAllWorkspaces = async () => {
    const all = await api.listAllWorkspaces().catch(() => []);
    setWorkspaces(all);
    setSelectedIndex((index) => Math.min(index, Math.max(0, all.length - 1)));
  };

  const syncTerminalDimensions = () => {
    if (!activeTerminalId) return;
    const active = terminals.current.get(activeTerminalId);
    if (!active) return;
    try {
      active.fit.fit();
      const { cols, rows } = active.terminal;
      if (cols > 0 && rows > 0) void api.resizeTerminal(active.sessionId, cols, rows);
    } catch {}
  };

  const addTerminalTab = async () => {
    setTerminalError(undefined);
    try {
      const { sessionId } = await api.createTerminal(workspace?.root);
      const tab = { id: sessionId, sessionId, label: workspace?.name ?? "Workspaces" };
      setTerminalTabs((current) => [...current, tab]);
      setActiveTerminalId(tab.id);
      setTerminalStage((stage) => (stage === "hidden" ? "partial" : stage));
    } catch {
      setTerminalError("Could not start a terminal session.");
    }
  };

  const closeTerminalTab = (id: string) => {
    const tab = terminalTabsRef.current.find((item) => item.id === id);
    if (!tab) return;
    terminals.current.get(id)?.terminal.dispose();
    terminals.current.delete(id);
    pendingOutput.current.delete(id);
    void api.closeTerminal(tab.sessionId);
    setTerminalTabs((current) => {
      const next = current.filter((item) => item.id !== id);
      setActiveTerminalId((active) => (active === id ? next.at(-1)?.id : active));
      return next;
    });
  };

  const handleToggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("aimoto-theme", next ? "dark" : "light");
        localStorage.setItem("aimoto-theme-v2", "true");
      } catch {}
      return next;
    });
  };

  const handleViewModeChange = (mode: "carousel" | "grid" | "list") => {
    setViewMode(mode);
    try {
      localStorage.setItem("aimoto-view-mode", mode);
    } catch {}
  };

  const handleCreateWorkspace = async (name: string) => {
    const created = await api.createWorkspace(name);
    await refreshAllWorkspaces();
    setWorkspace(created);
  };

  const handleImportWorkspace = async () => {
    const imported = await api.selectWorkspace();
    if (imported) {
      await refreshAllWorkspaces();
      setWorkspace(imported);
    }
  };

  const handleRenameWorkspace = async (root: string, newName: string) => {
    const updated = await api.renameWorkspace(root, newName);
    await refreshAllWorkspaces();
    if (workspace?.root === root) {
      setWorkspace(updated);
    }
  };

  const handleDeleteWorkspace = async (root: string) => {
    await api.deleteWorkspace(root);
    if (workspace?.root === root) {
      setWorkspace(undefined);
    }
    await refreshAllWorkspaces();
  };

  const handleOpenVersionHistory = async (target: WorkspaceInspection) => {
    setVersionHistoryWorkspace(target);
    setIsLoadingVersions(true);
    try {
      const list = await api.listWorkspaceVersions(target.root);
      setVersions(list);
    } catch {
      setVersions([]);
    } finally {
      setIsLoadingVersions(false);
    }
  };

  const handleRestoreVersion = async (versionId: string) => {
    if (!versionHistoryWorkspace) return;
    await api.restoreWorkspaceVersion(versionHistoryWorkspace.root, versionId);
    const refreshed = await api.listAllWorkspaces().catch(() => []);
    setWorkspaces(refreshed);
    const updated = refreshed.find((w) => w.root === versionHistoryWorkspace.root);
    if (updated) {
      setVersionHistoryWorkspace(updated);
      if (workspace?.root === updated.root) {
        setWorkspace(updated);
      }
    }
    const pres = await api.getWorkspacePresentation(versionHistoryWorkspace.root).catch(() => ({}));
    setPresentations((current) => ({ ...current, [versionHistoryWorkspace.root]: pres }));
  };

  // Initial load
  useEffect(() => {
    void refreshAllWorkspaces();
  }, []);

  // Sync theme class to documentElement
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  // Listen to OS theme changes when no explicit override is set
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem("aimoto-theme");
      } catch {}
      if (!stored) {
        setIsDark(e.matches);
      }
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Terminal theme sync
  useEffect(() => {
    const theme = getTerminalTheme();
    for (const { terminal } of terminals.current.values()) {
      terminal.options.theme = theme;
      terminal.refresh(0, Math.max(0, terminal.rows - 1));
    }
  }, [isDark]);

  // Load presentations for all workspaces
  useEffect(() => {
    void Promise.all(
      workspaces.map(async (item) => [item.root, await api.getWorkspacePresentation(item.root).catch(() => ({}))] as const)
    ).then((items) => setPresentations(Object.fromEntries(items)));
  }, [workspaces]);

  // Terminal lifecycle and output routing
  useEffect(() => {
    terminalTabsRef.current = terminalTabs;
  }, [terminalTabs]);

  useEffect(
    () =>
      api.onTerminalData(({ sessionId, chunk }) => {
        const tab = terminalTabsRef.current.find((item) => item.sessionId === sessionId);
        if (!tab) return;
        const instance = terminals.current.get(tab.id)?.terminal;
        if (instance) instance.write(chunk);
        else pendingOutput.current.set(tab.id, [...(pendingOutput.current.get(tab.id) ?? []), chunk]);
      }),
    []
  );

  useEffect(() => {
    for (const tab of terminalTabs) {
      const host = terminalHosts.current.get(tab.id);
      if (!host || terminals.current.has(tab.id)) continue;
      const fit = new FitAddon();
      const terminal = new Terminal({
        fontFamily: '"Cascadia Code", "Cascadia Mono", Consolas, "Courier New", monospace',
        fontSize: 14,
        cursorBlink: true,
        convertEol: true,
        theme: getTerminalTheme()
      });
      terminal.loadAddon(fit);
      terminal.open(host);
      terminal.onData((data) => void api.writeTerminal(tab.sessionId, data));
      terminals.current.set(tab.id, { terminal, fit, sessionId: tab.sessionId });
      for (const chunk of pendingOutput.current.get(tab.id) ?? []) terminal.write(chunk);
      pendingOutput.current.delete(tab.id);
    }
  }, [terminalTabs]);

  useEffect(
    () => () => {
      for (const { terminal } of terminals.current.values()) terminal.dispose();
    },
    []
  );

  useEffect(() => {
    const host = activeTerminalId ? terminalHosts.current.get(activeTerminalId) : undefined;
    if (!terminalVisible || !host) return;
    const observer = new ResizeObserver(() => requestAnimationFrame(syncTerminalDimensions));
    observer.observe(host);
    return () => observer.disconnect();
  }, [activeTerminalId, terminalVisible]);

  useEffect(() => {
    if (terminalVisible) {
      requestAnimationFrame(() => {
        syncTerminalDimensions();
        terminals.current.get(activeTerminalId ?? "")?.terminal.focus();
      });
    }
  }, [activeTerminalId, terminalStage, terminalVisible]);

  useEffect(() => {
    const hideTerminal = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTerminalStage("hidden");
    };
    window.addEventListener("keydown", hideTerminal);
    return () => window.removeEventListener("keydown", hideTerminal);
  }, []);

  // Filter workspaces based on real-time search query
  const query = searchQuery.trim().toLowerCase();
  const filteredWorkspaces = workspaces.filter(
    (w) =>
      w.name.toLowerCase().includes(query) ||
      w.root.toLowerCase().includes(query)
  );

  // Defensive clamping of selectedIndex when filtered workspaces change
  useEffect(() => {
    if (filteredWorkspaces.length > 0 && selectedIndex >= filteredWorkspaces.length) {
      setSelectedIndex(Math.max(0, filteredWorkspaces.length - 1));
    }
  }, [filteredWorkspaces.length, selectedIndex]);

  const terminalPanel = (
    <>
      {terminalStage === "hidden" && (
        <button
          className="fixed bottom-5 left-1/2 z-50 grid size-9 -translate-x-1/2 place-items-center rounded-full border border-[var(--terminal-border)] bg-[var(--terminal-background)] font-mono text-sm text-[var(--terminal-foreground)] shadow-lg"
          aria-label="Open terminal"
          onClick={() => (terminalTabs.length ? setTerminalStage("partial") : void addTerminalTab())}
        >
          {" "}
          &gt;_{" "}
        </button>
      )}
      <section
        aria-hidden={terminalStage === "hidden"}
        className={`aimoto-terminal fixed z-50 overflow-hidden border border-[var(--terminal-border)] bg-[var(--terminal-background)] text-[var(--terminal-foreground)] shadow-2xl ${
          terminalStage === "hidden"
            ? "pointer-events-none inset-x-0 bottom-0 h-72 translate-y-full opacity-0"
            : terminalStage === "partial"
            ? "inset-x-0 bottom-4 mx-auto h-72 w-[min(96vw,1480px)] translate-y-0 opacity-100"
            : "inset-x-0 bottom-0 h-[72vh] translate-y-0 opacity-100"
        }`}
      >
        <div className="flex h-8 items-center gap-1 border-b border-[var(--terminal-border)] px-2">
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {terminalTabs.map((tab) => (
              <div
                key={tab.id}
                className={`flex shrink-0 items-center gap-1 rounded-t px-2 py-1 text-xs ${
                  tab.id === activeTerminalId
                    ? "bg-[var(--terminal-tab)] text-[var(--terminal-foreground)]"
                    : "text-muted-foreground"
                }`}
              >
                <button onClick={() => setActiveTerminalId(tab.id)}>{tab.label}</button>
                <button aria-label={`Close ${tab.label} terminal`} onClick={() => closeTerminalTab(tab.id)}>
                  <X className="size-3" />
                </button>
              </div>
            ))}
            <button
              className="grid size-6 shrink-0 place-items-center rounded hover:bg-[var(--terminal-hover)]"
              aria-label="New terminal tab"
              title="New terminal tab"
              onClick={() => void addTerminalTab()}
            >
              <Plus className="size-4" />
            </button>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1 border-l border-[var(--terminal-border)] pl-2" role="toolbar" aria-label="Terminal controls">
            <button
              className="grid size-6 place-items-center rounded hover:bg-[var(--terminal-hover)]"
              aria-label="Hide terminal"
              title="Hide terminal"
              onClick={() => setTerminalStage("hidden")}
            >
              <Minus className="size-4" />
            </button>
            {terminalStage === "full" ? (
              <button
                className="grid size-6 place-items-center rounded hover:bg-[var(--terminal-hover)]"
                aria-label="Restore terminal size"
                title="Restore terminal size"
                onClick={() => setTerminalStage("partial")}
              >
                <Minimize2 className="size-4" />
              </button>
            ) : (
              <button
                className="grid size-6 place-items-center rounded hover:bg-[var(--terminal-hover)]"
                aria-label="Expand terminal"
                title="Expand terminal"
                onClick={() => setTerminalStage("full")}
              >
                <Maximize2 className="size-4" />
              </button>
            )}
          </div>
        </div>
        {terminalError && <p className="px-3 pt-2 text-xs text-destructive">{terminalError}</p>}
        <div
          className="h-[calc(100%-2rem)] px-3 pb-3 pt-2"
          onClick={() => terminals.current.get(activeTerminalId ?? "")?.terminal.focus()}
        >
          {terminalTabs.map((tab) => (
            <div
              key={tab.id}
              ref={(node) => {
                if (node) terminalHosts.current.set(tab.id, node);
                else terminalHosts.current.delete(tab.id);
              }}
              className={tab.id === activeTerminalId ? "h-full" : "hidden"}
            />
          ))}
        </div>
      </section>
    </>
  );

  // Active Workspace: Enhanced Runner View
  if (workspace) {
    const presentation = presentations[workspace.root];
    return (
      <div className="relative h-screen overflow-hidden bg-background text-foreground flex flex-col">
        <WorkspaceRunnerView
          workspace={workspace}
          allWorkspaces={workspaces}
          presentation={presentation}
          onBack={() => {
            setTerminalStage("hidden");
            setWorkspace(undefined);
          }}
          onSelectWorkspace={(item) => setWorkspace(item)}
          onOpenFolder={(root) => void api.openWorkspaceFolder(root)}
          onViewVersions={(item) => void handleOpenVersionHistory(item)}
        />

        {terminalPanel}

        {versionHistoryWorkspace && (
          <VersionHistoryDialog
            open={versionHistoryWorkspace !== undefined}
            onOpenChange={(open) => {
              if (!open) setVersionHistoryWorkspace(undefined);
            }}
            workspaceName={versionHistoryWorkspace.name}
            workspaceRoot={versionHistoryWorkspace.root}
            currentVersionId={versionHistoryWorkspace.currentVersionId}
            currentRevision={versionHistoryWorkspace.revision}
            versions={versions}
            loading={isLoadingVersions}
            onRestore={handleRestoreVersion}
          />
        )}
      </div>
    );
  }

  // Home View: Navigation, 2D Adaptive Carousel or Workspace Hub (Grid/List), Dialogs
  return (
    <div
      className={cn(
        "relative min-h-screen bg-background text-foreground flex flex-col",
        viewMode === "carousel" && "h-screen overflow-hidden"
      )}
    >
      <HeaderNavigation
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        onNewWorkspace={() => setIsCreateDialogOpen(true)}
        onImportWorkspace={handleImportWorkspace}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
        workspaceCount={workspaces.length}
        appIconUrl={appIcon}
      />

      <main
        className={cn(
          "flex-1 flex flex-col justify-center min-h-0",
          viewMode !== "carousel" && "overflow-y-auto"
        )}
      >
        {viewMode === "carousel" ? (
          filteredWorkspaces.length > 0 ? (
            <AdaptiveCarousel
              workspaces={filteredWorkspaces}
              selectedIndex={selectedIndex}
              onSelectIndex={setSelectedIndex}
              onLaunchWorkspace={(item) => setWorkspace(item)}
              presentations={presentations}
              terminalStage={terminalStage}
            />
          ) : (
            <WorkspaceHub
              workspaces={filteredWorkspaces}
              viewMode="grid"
              presentations={presentations}
              searchQuery={searchQuery}
              onClearSearch={() => setSearchQuery("")}
              onNewWorkspace={() => setIsCreateDialogOpen(true)}
              onImportWorkspace={handleImportWorkspace}
              onLaunch={(item) => setWorkspace(item)}
              onOpenFolder={(root) => void api.openWorkspaceFolder(root)}
              onRename={handleRenameWorkspace}
              onDelete={handleDeleteWorkspace}
              onViewVersions={handleOpenVersionHistory}
              className={terminalStage === "partial" ? "pb-80" : terminalStage === "full" ? "pb-[74vh]" : undefined}
            />
          )
        ) : (
          <WorkspaceHub
            workspaces={filteredWorkspaces}
            viewMode={viewMode}
            presentations={presentations}
            searchQuery={searchQuery}
            onClearSearch={() => setSearchQuery("")}
            onNewWorkspace={() => setIsCreateDialogOpen(true)}
            onImportWorkspace={handleImportWorkspace}
            onLaunch={(item) => setWorkspace(item)}
            onOpenFolder={(root) => void api.openWorkspaceFolder(root)}
            onRename={handleRenameWorkspace}
            onDelete={handleDeleteWorkspace}
            onViewVersions={handleOpenVersionHistory}
            className={terminalStage === "partial" ? "pb-80" : terminalStage === "full" ? "pb-[74vh]" : undefined}
          />
        )}
      </main>

      {terminalPanel}

      <CreateWorkspaceDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onCreate={handleCreateWorkspace}
      />

      {versionHistoryWorkspace && (
        <VersionHistoryDialog
          open={versionHistoryWorkspace !== undefined}
          onOpenChange={(open) => {
            if (!open) setVersionHistoryWorkspace(undefined);
          }}
          workspaceName={versionHistoryWorkspace.name}
          workspaceRoot={versionHistoryWorkspace.root}
          currentVersionId={versionHistoryWorkspace.currentVersionId}
          currentRevision={versionHistoryWorkspace.revision}
          versions={versions}
          loading={isLoadingVersions}
          onRestore={handleRestoreVersion}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
