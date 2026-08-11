import "./renderer.css";
import "../../../packages/ui-primitives/src/tokens.css";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, ChevronLeft, ChevronRight, FolderOpen, Maximize2, Minimize2, Minus, Plus, X } from "lucide-react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { WorkspaceInspection } from "@ai-mo-to/engine";
import type { WorkspacePresentation } from "./contracts.js";
import { Button } from "./components/ui/button.js";
import { WorkspaceManagerDrawer } from "./components/workspace-manager-drawer.js";
import { WorkspaceFrame } from "./components/workspace-frame.js";

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
  return { background: token("--terminal-background"), foreground: token("--terminal-foreground"), cursor: token("--terminal-cursor"), cursorAccent: token("--terminal-background"), selectionBackground: token("--terminal-selection"), black: token("--terminal-background"), brightBlack: token("--muted-foreground"), red: "#df4f5f", brightRed: "#ff7280", green: token("--primary"), brightGreen: "#7df0ac", yellow: "#d7a941", brightYellow: "#f2ca66", blue: "#5798e8", brightBlue: "#86baff", magenta: "#bb7ae5", brightMagenta: "#d5a8fa", cyan: "#4fb9c7", brightCyan: "#80d7e2", white: token("--terminal-foreground"), brightWhite: token("--foreground") };
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
  const [isDark, setIsDark] = useState(() => localStorage.getItem("aimoto-theme") !== "light");
  const terminalHosts = useRef(new Map<string, HTMLDivElement>());
  const terminals = useRef(new Map<string, { terminal: Terminal; fit: FitAddon; sessionId: string }>());
  const pendingOutput = useRef(new Map<string, string[]>());
  const terminalTabsRef = useRef<TerminalTab[]>([]);
  const terminalVisible = terminalStage !== "hidden";

  const refreshAllWorkspaces = async () => {
    const all = await api.listAllWorkspaces().catch(() => []);
    setWorkspaces(all);
    setSelectedIndex(index => Math.min(index, Math.max(0, all.length - 1)));
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
      setTerminalTabs(current => [...current, tab]);
      setActiveTerminalId(tab.id);
      setTerminalStage(stage => stage === "hidden" ? "partial" : stage);
    } catch {
      setTerminalError("Could not start a terminal session.");
    }
  };

  const closeTerminalTab = (id: string) => {
    const tab = terminalTabsRef.current.find(item => item.id === id);
    if (!tab) return;
    terminals.current.get(id)?.terminal.dispose();
    terminals.current.delete(id);
    pendingOutput.current.delete(id);
    void api.closeTerminal(tab.sessionId);
    setTerminalTabs(current => {
      const next = current.filter(item => item.id !== id);
      setActiveTerminalId(active => active === id ? next.at(-1)?.id : active);
      return next;
    });
  };

  useEffect(() => { void refreshAllWorkspaces(); }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("aimoto-theme", isDark ? "dark" : "light");
  }, [isDark]);
  useEffect(() => {
    const theme = getTerminalTheme();
    for (const { terminal } of terminals.current.values()) {
      terminal.options.theme = theme;
      terminal.refresh(0, Math.max(0, terminal.rows - 1));
    }
  }, [isDark]);
  useEffect(() => {
    void Promise.all(workspaces.map(async item => [item.root, await api.getWorkspacePresentation(item.root).catch(() => ({}))] as const))
      .then(items => setPresentations(Object.fromEntries(items)));
  }, [workspaces]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (workspace || workspaces.length < 2) return;
      if (event.key === "ArrowLeft") setSelectedIndex(index => (index - 1 + workspaces.length) % workspaces.length);
      if (event.key === "ArrowRight") setSelectedIndex(index => (index + 1) % workspaces.length);
      if (event.key === "Enter") setWorkspace(workspaces[selectedIndex]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIndex, workspace, workspaces]);
  useEffect(() => { terminalTabsRef.current = terminalTabs; }, [terminalTabs]);
  useEffect(() => api.onTerminalData(({ sessionId, chunk }) => {
    const tab = terminalTabsRef.current.find(item => item.sessionId === sessionId);
    if (!tab) return;
    const instance = terminals.current.get(tab.id)?.terminal;
    if (instance) instance.write(chunk);
    else pendingOutput.current.set(tab.id, [...(pendingOutput.current.get(tab.id) ?? []), chunk]);
  }), []);
  useEffect(() => {
    for (const tab of terminalTabs) {
      const host = terminalHosts.current.get(tab.id);
      if (!host || terminals.current.has(tab.id)) continue;
      const fit = new FitAddon();
      const terminal = new Terminal({ fontFamily: '"Cascadia Code", "Cascadia Mono", Consolas, "Courier New", monospace', fontSize: 14, cursorBlink: true, convertEol: true, theme: getTerminalTheme() });
      terminal.loadAddon(fit); terminal.open(host);
      terminal.onData(data => void api.writeTerminal(tab.sessionId, data));
      terminals.current.set(tab.id, { terminal, fit, sessionId: tab.sessionId });
      for (const chunk of pendingOutput.current.get(tab.id) ?? []) terminal.write(chunk);
      pendingOutput.current.delete(tab.id);
    }
  }, [terminalTabs]);
  useEffect(() => () => {
    for (const { terminal } of terminals.current.values()) terminal.dispose();
  }, []);
  useEffect(() => {
    const host = activeTerminalId ? terminalHosts.current.get(activeTerminalId) : undefined;
    if (!terminalVisible || !host) return;
    const observer = new ResizeObserver(() => requestAnimationFrame(syncTerminalDimensions));
    observer.observe(host); return () => observer.disconnect();
  }, [activeTerminalId, terminalVisible]);
  useEffect(() => { if (terminalVisible) requestAnimationFrame(() => { syncTerminalDimensions(); terminals.current.get(activeTerminalId ?? "")?.terminal.focus(); }); }, [activeTerminalId, terminalStage, terminalVisible]);
  useEffect(() => {
    const hideTerminal = (event: KeyboardEvent) => { if (event.key === "Escape") setTerminalStage("hidden"); };
    window.addEventListener("keydown", hideTerminal); return () => window.removeEventListener("keydown", hideTerminal);
  }, []);

  const selected = workspaces[selectedIndex];
  const choose = (item: WorkspaceInspection) => setWorkspace(item);
  const move = (delta: number) => setSelectedIndex(index => (index + delta + workspaces.length) % workspaces.length);
  const terminalPanel = <>
    {terminalStage === "hidden" && <button className="fixed bottom-5 left-1/2 z-50 grid size-9 -translate-x-1/2 place-items-center rounded-full border border-[var(--terminal-border)] bg-[var(--terminal-background)] font-mono text-sm text-[var(--terminal-foreground)] shadow-lg" aria-label="Open terminal" onClick={() => terminalTabs.length ? setTerminalStage("partial") : void addTerminalTab()}> &gt;_ </button>}
    <section aria-hidden={terminalStage === "hidden"} className={`aimoto-terminal fixed z-50 overflow-hidden border border-[var(--terminal-border)] bg-[var(--terminal-background)] text-[var(--terminal-foreground)] shadow-2xl ${terminalStage === "hidden" ? "pointer-events-none inset-x-0 bottom-0 h-72 translate-y-full opacity-0" : terminalStage === "partial" ? "inset-x-0 bottom-4 mx-auto h-72 w-[min(96vw,1480px)] translate-y-0 opacity-100" : "inset-x-0 bottom-0 h-[72vh] translate-y-0 opacity-100"}`}>
      <div className="flex h-8 items-center gap-1 border-b border-[var(--terminal-border)] px-2">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">{terminalTabs.map(tab => <div key={tab.id} className={`flex shrink-0 items-center gap-1 rounded-t px-2 py-1 text-xs ${tab.id === activeTerminalId ? "bg-[var(--terminal-tab)] text-[var(--terminal-foreground)]" : "text-muted-foreground"}`}><button onClick={() => setActiveTerminalId(tab.id)}>{tab.label}</button><button aria-label={`Close ${tab.label} terminal`} onClick={() => closeTerminalTab(tab.id)}><X className="size-3" /></button></div>)}<button className="grid size-6 shrink-0 place-items-center rounded hover:bg-[var(--terminal-hover)]" aria-label="New terminal tab" title="New terminal tab" onClick={() => void addTerminalTab()}><Plus className="size-4" /></button></div>
        <div className="ml-auto flex shrink-0 items-center gap-1 border-l border-[var(--terminal-border)] pl-2" role="toolbar" aria-label="Terminal controls"><button className="grid size-6 place-items-center rounded hover:bg-[var(--terminal-hover)]" aria-label="Hide terminal" title="Hide terminal" onClick={() => setTerminalStage("hidden")}><Minus className="size-4" /></button>{terminalStage === "full" ? <button className="grid size-6 place-items-center rounded hover:bg-[var(--terminal-hover)]" aria-label="Restore terminal size" title="Restore terminal size" onClick={() => setTerminalStage("partial")}><Minimize2 className="size-4" /></button> : <button className="grid size-6 place-items-center rounded hover:bg-[var(--terminal-hover)]" aria-label="Expand terminal" title="Expand terminal" onClick={() => setTerminalStage("full")}><Maximize2 className="size-4" /></button>}</div>
      </div>
      {terminalError && <p className="px-3 pt-2 text-xs text-destructive">{terminalError}</p>}
      <div className="h-[calc(100%-2rem)] px-3 pb-3 pt-2" onClick={() => terminals.current.get(activeTerminalId ?? "")?.terminal.focus()}>{terminalTabs.map(tab => <div key={tab.id} ref={node => { if (node) terminalHosts.current.set(tab.id, node); else terminalHosts.current.delete(tab.id); }} className={tab.id === activeTerminalId ? "h-full" : "hidden"} />)}</div>
    </section>
  </>;

  if (workspace) {
    const presentation = presentations[workspace.root] ?? {};
    return <main className="h-screen overflow-hidden bg-background text-foreground">
      <header className="relative z-10 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur">
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground" onClick={() => { setTerminalStage("hidden"); setWorkspace(undefined); }}><ArrowLeft className="size-4" /> Back</Button>
        <span className="aimoto-display text-sm">{workspace.name}</span>
        <Button variant="ghost" size="icon" title="Open workspace folder" onClick={() => void api.openWorkspaceFolder(workspace.root)}><FolderOpen className="size-4" /></Button>
      </header>
      <section className="h-[calc(100vh-3.5rem)] bg-muted">
        {presentation.entryUrl ? <WorkspaceFrame workspace={workspace} presentation={presentation} /> : <div className="grid h-full place-items-center"><button onClick={() => void api.openWorkspaceFolder(workspace.root)} className="group grid place-items-center gap-3 text-muted-foreground hover:text-foreground"><span className="grid size-16 place-items-center rounded-2xl bg-white/5 transition group-hover:bg-primary/15"><FolderOpen className="size-6" /></span><span className="sr-only">Open workspace folder</span></button></div>}
      </section>
      {terminalPanel}
    </main>;
  }

  return <main className="relative isolate min-h-screen overflow-hidden bg-background text-foreground">
    <div aria-hidden="true" className="aimoto-ambient pointer-events-none absolute inset-0 -z-10" />
    <header className="relative z-10 flex h-16 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur"><div className="flex items-center gap-2"><img src={appIcon} alt="" className="size-8 object-contain" /><span className="aimoto-wordmark">AIMOTO</span></div><WorkspaceManagerDrawer activeWorkspace={undefined} workspaces={workspaces} onSelectWorkspace={choose} onRefreshWorkspaces={refreshAllWorkspaces} onImportWorkspace={() => Promise.resolve()} isDark={isDark} onToggleTheme={() => setIsDark(value => !value)} /></header>
    {selected ? <section className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1500px] items-center justify-center px-6 pb-24">
      <button aria-label="Previous workspace" className="mr-5 grid size-11 place-items-center rounded-full border border-border/70 bg-card/80 text-muted-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent hover:text-foreground hover:shadow-md" onClick={() => move(-1)}><ChevronLeft /></button>
      <div className="relative flex h-[min(67vh,680px)] w-full max-w-5xl items-center justify-center before:absolute before:inset-x-[12%] before:bottom-[-7%] before:h-16 before:rounded-full before:bg-primary/20 before:blur-3xl before:content-['']">
        {workspaces.map((item, index) => { const offset = index - selectedIndex; const isCenter = offset === 0; const presentation = presentations[item.root]; return <button key={item.root} onClick={() => isCenter ? choose(item) : setSelectedIndex(index)} className={`aimoto-carousel-card group absolute overflow-hidden rounded-[1.75rem] border text-left transition-all duration-500 ${isCenter ? "aimoto-carousel-center z-20 h-full w-[min(80%,980px)] border-primary/70 bg-card shadow-[0_24px_80px_color-mix(in_oklab,var(--primary)_20%,transparent)]" : "z-10 h-[78%] w-[min(62%,760px)] border-border bg-card opacity-35 shadow-xl hover:opacity-70"}`} style={{ transform: `translateX(${offset * 58}%) scale(${isCenter ? 1 : .84})`, pointerEvents: Math.abs(offset) > 1 ? "none" : "auto" }}>
          <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,color-mix(in_oklab,var(--background),transparent_5%)_100%)]" />
          {presentation?.thumbnailUrl ? <img src={presentation.thumbnailUrl} alt="" className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.015]" /> : <div className="grid h-full place-items-center bg-muted"><span className="aimoto-display text-7xl text-primary/65">{item.name.slice(0, 1)}</span></div>}
          <div className="absolute inset-x-0 bottom-0 p-7"><div><h1 className="aimoto-display text-2xl">{item.name}</h1><p className="mt-1 text-xs text-muted-foreground">rev {item.revision}</p></div></div>
        </button>; })}
      </div>
      <button aria-label="Next workspace" className="ml-5 grid size-11 place-items-center rounded-full border border-border/70 bg-card/80 text-muted-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent hover:text-foreground hover:shadow-md" onClick={() => move(1)}><ChevronRight /></button>
    </section> : <section className="min-h-[calc(100vh-4rem)]" />}
    {terminalPanel}
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
