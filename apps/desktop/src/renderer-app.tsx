import "./renderer.css";
import "../../../packages/ui-primitives/src/tokens.css";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, ChevronLeft, ChevronRight, FolderOpen, Maximize2 } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { WorkspaceInspection } from "@ai-mo-to/engine";
import type { WorkspacePresentation } from "./contracts.js";
import { Button } from "./components/ui/button.js";
import { WorkspaceManagerDrawer } from "./components/workspace-manager-drawer.js";

const api = window.aimoto;
const appIcon = new URL("../build/icon.png", import.meta.url).href;

function App() {
  const [workspace, setWorkspace] = useState<WorkspaceInspection>();
  const [workspaces, setWorkspaces] = useState<WorkspaceInspection[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [presentations, setPresentations] = useState<Record<string, WorkspacePresentation>>({});
  const [terminalStage, setTerminalStage] = useState<"hidden" | "partial" | "full">("hidden");
  const terminalHost = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | undefined>(undefined);
  const fitAddon = useRef<FitAddon | undefined>(undefined);
  const sessionId = useRef<string | undefined>(undefined);
  const pendingInput = useRef<string[]>([]);
  const terminalVisible = terminalStage !== "hidden";

  const refreshAllWorkspaces = async () => {
    const all = await api.listAllWorkspaces().catch(() => []);
    setWorkspaces(all);
    setSelectedIndex(index => Math.min(index, Math.max(0, all.length - 1)));
  };
  const syncTerminalDimensions = () => {
    if (!fitAddon.current || !terminal.current) return;
    try {
      fitAddon.current.fit();
      const cols = terminal.current.cols;
      const rows = terminal.current.rows;
      if (sessionId.current && cols > 0 && rows > 0) void api.resizeTerminal(sessionId.current, cols, rows);
    } catch {}
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
  useEffect(() => {
    if (!terminalVisible || !terminalHost.current || terminal.current) return;
    const fit = new FitAddon();
    const next = new Terminal({ fontFamily: '"Cascadia Code", "Cascadia Mono", Consolas, "Courier New", monospace', fontSize: 14, cursorBlink: true, convertEol: true, theme: { background: "#0c0e11", foreground: "#f3f5f7", cursor: "#f3f5f7", selectionBackground: "#334155" } });
    next.loadAddon(fit); next.open(terminalHost.current); terminal.current = next; fitAddon.current = fit;
    api.onTerminalData(({ sessionId: id, chunk }) => { if (id === sessionId.current) next.write(chunk); });
    next.onData(data => { if (sessionId.current) void api.writeTerminal(sessionId.current, data); else pendingInput.current.push(data); });
    requestAnimationFrame(() => { syncTerminalDimensions(); next.focus(); });
    return () => { next.dispose(); terminal.current = undefined; fitAddon.current = undefined; };
  }, [terminalVisible]);
  useEffect(() => {
    if (!terminalVisible || !terminalHost.current) return;
    const observer = new ResizeObserver(() => requestAnimationFrame(syncTerminalDimensions));
    observer.observe(terminalHost.current); return () => observer.disconnect();
  }, [terminalVisible]);
  useEffect(() => { if (terminalVisible) { syncTerminalDimensions(); terminal.current?.focus(); } }, [terminalStage, terminalVisible]);
  useEffect(() => {
    if (terminalVisible) void api.createTerminal(workspace?.root).then(({ sessionId: id }) => {
      sessionId.current = id;
      for (const input of pendingInput.current.splice(0)) void api.writeTerminal(id, input);
      requestAnimationFrame(() => { syncTerminalDimensions(); terminal.current?.focus(); });
    });
  }, [workspace?.root, terminalVisible]);
  useEffect(() => {
    const hideTerminal = (event: KeyboardEvent) => { if (event.key === "Escape") setTerminalStage("hidden"); };
    window.addEventListener("keydown", hideTerminal); return () => window.removeEventListener("keydown", hideTerminal);
  }, []);

  const selected = workspaces[selectedIndex];
  const choose = (item: WorkspaceInspection) => setWorkspace(item);
  const move = (delta: number) => setSelectedIndex(index => (index + delta + workspaces.length) % workspaces.length);
  const terminalPanel = <section className={terminalStage === "hidden" ? "fixed bottom-5 left-1/2 z-50 -translate-x-1/2" : terminalStage === "partial" ? "fixed inset-x-0 bottom-4 z-50 mx-auto h-72 w-[min(96vw,1480px)] overflow-hidden border border-border bg-[#0c0e11] shadow-2xl" : "fixed inset-x-0 bottom-0 z-50 h-[72vh] border-t border-border bg-[#0c0e11] shadow-2xl"}>
    {terminalStage === "hidden" ? <button className="grid size-9 place-items-center rounded-full border border-border bg-[#0c0e11] font-mono text-sm text-foreground shadow-lg" aria-label="Open terminal" onClick={() => setTerminalStage("partial")}> &gt;_ </button> : <><button className="absolute inset-x-0 top-0 z-10 grid h-6 place-items-center bg-[#0c0e11] font-mono text-[11px] text-muted-foreground" aria-label={terminalStage === "partial" ? "Expand terminal" : "Hide terminal"} onClick={() => setTerminalStage(stage => stage === "partial" ? "full" : "hidden")}> &gt;_ </button><div className="h-full px-3 pb-3 pt-7" onClick={() => terminal.current?.focus()}><div ref={terminalHost} className="h-full" /></div></>}</section>;

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
