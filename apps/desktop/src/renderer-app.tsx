import "./renderer.css";
import "../../../packages/ui-primitives/src/tokens.css";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, ChevronLeft, ChevronRight, FolderOpen, Maximize2, Minimize2, Minus, Plus, X } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { WorkspaceInspection } from "@ai-mo-to/engine";
import type { WorkspacePresentation } from "./contracts.js";
import { Button } from "./components/ui/button.js";
import { WorkspaceManagerDrawer } from "./components/workspace-manager-drawer.js";

const api = window.aimoto;
const appIcon = new URL("../build/icon.png", import.meta.url).href;

interface TerminalTab {
  id: string;
  sessionId: string;
  label: string;
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
      const terminal = new Terminal({ fontFamily: '"Cascadia Code", "Cascadia Mono", Consolas, "Courier New", monospace', fontSize: 14, cursorBlink: true, convertEol: true, theme: { background: "#0c0e11", foreground: "#f3f5f7", cursor: "#f3f5f7", selectionBackground: "#334155" } });
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
    {terminalStage === "hidden" && <button className="fixed bottom-5 left-1/2 z-50 grid size-9 -translate-x-1/2 place-items-center rounded-full border border-border bg-[#0c0e11] font-mono text-sm text-foreground shadow-lg" aria-label="Open terminal" onClick={() => terminalTabs.length ? setTerminalStage("partial") : void addTerminalTab()}> &gt;_ </button>}
    <section className={terminalStage === "hidden" ? "hidden" : terminalStage === "partial" ? "fixed inset-x-0 bottom-4 z-50 mx-auto h-72 w-[min(96vw,1480px)] overflow-hidden border border-border bg-[#0c0e11] shadow-2xl" : "fixed inset-x-0 bottom-0 z-50 h-[72vh] border-t border-border bg-[#0c0e11] shadow-2xl"}>
      <div className="flex h-8 items-center gap-1 border-b border-white/10 px-2">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">{terminalTabs.map(tab => <div key={tab.id} className={`flex shrink-0 items-center gap-1 rounded-t px-2 py-1 text-xs ${tab.id === activeTerminalId ? "bg-white/10 text-foreground" : "text-muted-foreground"}`}><button onClick={() => setActiveTerminalId(tab.id)}>{tab.label}</button><button aria-label={`Close ${tab.label} terminal`} onClick={() => closeTerminalTab(tab.id)}><X className="size-3" /></button></div>)}<button className="grid size-6 shrink-0 place-items-center rounded hover:bg-white/10" aria-label="New terminal tab" title="New terminal tab" onClick={() => void addTerminalTab()}><Plus className="size-4" /></button></div>
        <div className="ml-auto flex shrink-0 items-center gap-1 border-l border-white/10 pl-2" role="toolbar" aria-label="Terminal controls"><button className="grid size-6 place-items-center rounded hover:bg-white/10" aria-label="Hide terminal" title="Hide terminal" onClick={() => setTerminalStage("hidden")}><Minus className="size-4" /></button>{terminalStage === "full" ? <button className="grid size-6 place-items-center rounded hover:bg-white/10" aria-label="Restore terminal size" title="Restore terminal size" onClick={() => setTerminalStage("partial")}><Minimize2 className="size-4" /></button> : <button className="grid size-6 place-items-center rounded hover:bg-white/10" aria-label="Expand terminal" title="Expand terminal" onClick={() => setTerminalStage("full")}><Maximize2 className="size-4" /></button>}</div>
      </div>
      {terminalError && <p className="px-3 pt-2 text-xs text-red-300">{terminalError}</p>}
      <div className="h-[calc(100%-2rem)] px-3 pb-3 pt-2" onClick={() => terminals.current.get(activeTerminalId ?? "")?.terminal.focus()}>{terminalTabs.map(tab => <div key={tab.id} ref={node => { if (node) terminalHosts.current.set(tab.id, node); else terminalHosts.current.delete(tab.id); }} className={tab.id === activeTerminalId ? "h-full" : "hidden"} />)}</div>
    </section>
  </>;

  if (workspace) {
    const presentation = presentations[workspace.root] ?? {};
    return <main className="h-screen overflow-hidden bg-[#090b10] text-foreground">
      <header className="relative z-10 flex h-14 items-center justify-between border-b border-white/8 bg-[#0d1017]/90 px-4 backdrop-blur">
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground" onClick={() => { setTerminalStage("hidden"); setWorkspace(undefined); }}><ArrowLeft className="size-4" /> Back</Button>
        <span className="aimoto-display text-sm">{workspace.name}</span>
        <Button variant="ghost" size="icon" title="Open workspace folder" onClick={() => void api.openWorkspaceFolder(workspace.root)}><FolderOpen className="size-4" /></Button>
      </header>
      <section className="h-[calc(100vh-3.5rem)] bg-[#080a0f]">
        {presentation.entryUrl ? <iframe title={workspace.name} src={presentation.entryUrl} className="h-full w-full border-0 bg-white" /> : <div className="grid h-full place-items-center"><button onClick={() => void api.openWorkspaceFolder(workspace.root)} className="group grid place-items-center gap-3 text-muted-foreground hover:text-foreground"><span className="grid size-16 place-items-center rounded-2xl bg-white/5 transition group-hover:bg-primary/15"><FolderOpen className="size-6" /></span><span className="sr-only">Open workspace folder</span></button></div>}
      </section>
      {terminalPanel}
    </main>;
  }

  return <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_50%_20%,#202446_0%,#0b0d14_38%,#07090e_75%)] text-foreground">
    <header className="flex h-16 items-center justify-between px-6"><div className="flex items-center gap-2"><img src={appIcon} alt="" className="size-8 object-contain" /><span className="aimoto-wordmark">AIMOTO</span></div><WorkspaceManagerDrawer activeWorkspace={undefined} workspaces={workspaces} onSelectWorkspace={choose} onRefreshWorkspaces={refreshAllWorkspaces} onImportWorkspace={() => Promise.resolve()} /></header>
    {selected ? <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1500px] items-center justify-center px-6 pb-24">
      <button aria-label="Previous workspace" className="mr-4 grid size-11 place-items-center rounded-full bg-white/5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground" onClick={() => move(-1)}><ChevronLeft /></button>
      <div className="relative flex h-[min(67vh,680px)] w-full max-w-5xl items-center justify-center">
        {workspaces.map((item, index) => { const offset = index - selectedIndex; const isCenter = offset === 0; const presentation = presentations[item.root]; return <button key={item.root} onClick={() => isCenter ? choose(item) : setSelectedIndex(index)} className={`absolute overflow-hidden rounded-2xl border text-left transition-all duration-500 ${isCenter ? "z-20 h-full w-[min(80%,980px)] border-primary/70 bg-[#10141e] shadow-[0_25px_100px_rgba(0,0,0,.55)]" : "z-10 h-[78%] w-[min(62%,760px)] border-white/10 bg-[#0d1017] opacity-35 hover:opacity-70"}`} style={{ transform: `translateX(${offset * 58}%) scale(${isCenter ? 1 : .84})`, pointerEvents: Math.abs(offset) > 1 ? "none" : "auto" }}>
          <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,rgba(6,8,13,.96)_100%)]" />
          {presentation?.thumbnailUrl ? <img src={presentation.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_30%_20%,#28305c,transparent_45%),linear-gradient(135deg,#121723,#090b10)]"><span className="aimoto-display text-7xl text-primary/65">{item.name.slice(0, 1)}</span></div>}
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-7"><div><h1 className="aimoto-display text-2xl">{item.name}</h1><p className="mt-1 text-xs text-muted-foreground">rev {item.revision}</p></div>{isCenter && <span className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg"><Maximize2 className="size-4" /></span>}</div>
        </button>; })}
      </div>
      <button aria-label="Next workspace" className="ml-4 grid size-11 place-items-center rounded-full bg-white/5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground" onClick={() => move(1)}><ChevronRight /></button>
    </section> : <section className="min-h-[calc(100vh-4rem)]" />}
    {terminalPanel}
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
