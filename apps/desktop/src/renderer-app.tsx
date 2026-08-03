import "./renderer.css";
import "../../../packages/ui-primitives/src/tokens.css";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { FolderOpen, Settings2, Sparkles } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { WorkspaceInspection } from "@ai-mo-to/engine";
import { Badge } from "./components/ui/badge.js";
import { Button } from "./components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card.js";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./components/ui/dialog.js";

const api = window.aimoto;
const authority = (mode: string) => mode === "suggest" ? "Suggest changes" : `${mode} mode`;

function App() {
  const [workspace, setWorkspace] = useState<WorkspaceInspection>();
  const [workspaces, setWorkspaces] = useState<WorkspaceInspection[]>([]);
  const [terminalStage, setTerminalStage] = useState<"hidden" | "partial" | "full">("hidden");
  const terminalHost = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | undefined>(undefined);
  const fitAddon = useRef<FitAddon | undefined>(undefined);
  const sessionId = useRef<string | undefined>(undefined);
  const pendingInput = useRef<string[]>([]);
  const terminalVisible = terminalStage !== "hidden";

  useEffect(() => { void api.openDefaultWorkspace().then(ws => { setWorkspace(ws); setWorkspaces([ws]); }).catch(() => undefined); }, []);
  useEffect(() => {
    if (!terminalVisible || !terminalHost.current || terminal.current) return;
    const fit = new FitAddon(); const next = new Terminal({ fontFamily: '"Cascadia Mono", Consolas, monospace', fontSize: 14, cursorBlink: true, theme: { background: "#0c0e11", foreground: "#f3f5f7", cursor: "#f3f5f7", selectionBackground: "#334155" } });
    next.loadAddon(fit); next.open(terminalHost.current); terminal.current = next; fitAddon.current = fit;
    api.onTerminalData(({ sessionId: id, chunk }) => { if (id === sessionId.current) next.write(chunk); });
    next.onData(data => { if (sessionId.current) void api.writeTerminal(sessionId.current, data); else pendingInput.current.push(data); });
    requestAnimationFrame(() => { fit.fit(); next.focus(); });
    return () => { next.dispose(); terminal.current = undefined; fitAddon.current = undefined; };
  }, [terminalVisible]);
  useEffect(() => { if (terminalVisible) void api.createTerminal(workspace?.root).then(({ sessionId: id }) => { sessionId.current = id; for (const input of pendingInput.current.splice(0)) void api.writeTerminal(id, input); requestAnimationFrame(() => { fitAddon.current?.fit(); terminal.current?.focus(); }); }); }, [workspace?.root, terminalVisible]);
  useEffect(() => {
    const hideTerminal = (event: KeyboardEvent) => { if (event.key === "Escape") setTerminalStage("hidden"); };
    window.addEventListener("keydown", hideTerminal);
    return () => window.removeEventListener("keydown", hideTerminal);
  }, []);
  async function selectWorkspace() { const ws = await api.selectWorkspace(); if (ws) { setWorkspace(ws); setWorkspaces(current => current.some(item => item.root === ws.root) ? current : [...current, ws]); } }
  function sendPrompt(prompt: string) { setTerminalStage("partial"); window.setTimeout(() => { if (sessionId.current) void api.writeTerminal(sessionId.current, prompt); }, 250); }

  return <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_var(--aimoto-accent-soft),_transparent_38%)]">
    <header className="flex h-16 items-center justify-between px-6"><div className="flex items-center gap-2 font-semibold tracking-tight"><Sparkles className="size-4 text-primary" /> aimoto</div><Button variant="ghost" size="sm" onClick={() => void selectWorkspace()}><FolderOpen className="size-4" /> Open workspace</Button></header>
    <section className="mx-auto flex max-w-6xl flex-col px-6 pt-[11vh]"><div className="relative h-[min(58vh,560px)]">{workspaces.map((ws, index) => {
      const active = workspace?.root === ws.root;
      return <Card key={ws.root} onClick={() => setWorkspace(ws)} className={`absolute inset-x-0 mx-auto w-[min(52rem,86vw)] cursor-pointer transition-all duration-300 ${active ? "z-20 -translate-y-2 border-primary/60 shadow-2xl" : "z-10 translate-y-10 scale-[.94] opacity-60 hover:opacity-90"}`} style={{ top: `${index * 18}px` }}>
        <CardHeader><div className="flex items-start justify-between gap-4"><div className="flex gap-4"><div className="grid size-12 place-items-center rounded-lg bg-primary/10 text-lg font-semibold text-primary">{ws.name.slice(0, 1).toUpperCase()}</div><div><CardTitle className="text-xl">{ws.name}</CardTitle><CardDescription className="mt-1 line-clamp-2">{ws.modules.length} installed surfaces · revision {ws.revision}</CardDescription></div></div><div className="flex items-center gap-2"><Badge>{authority(ws.authorityMode)}</Badge><Dialog><DialogTrigger asChild><Button aria-label={`Workspace settings for ${ws.name}`} variant="ghost" size="icon" onClick={event => event.stopPropagation()}><Settings2 className="size-4" /></Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>{ws.name}</DialogTitle><DialogDescription>Actions are sent as a prompt to the active AI agent in the terminal. Nothing changes until you review and confirm it there.</DialogDescription></DialogHeader><div className="mt-8 grid gap-3"><Button variant="outline" onClick={() => sendPrompt(`Please rename this AI-Mo-To workspace from "${ws.name}" to: `)}>Rename workspace</Button><Button variant="outline" onClick={() => sendPrompt(`Please help me edit the settings for the AI-Mo-To workspace "${ws.name}". First show me what can be changed.`)}>Edit settings</Button><Button variant="outline" onClick={() => sendPrompt(`Please explain the safe, reversible steps to delete the AI-Mo-To workspace "${ws.name}". Do not delete anything until I explicitly confirm.`)}>Delete workspace</Button></div></DialogContent></Dialog></div></div></CardHeader>
        <CardContent><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{ws.modules.map(module => <div key={module.moduleId} className="rounded-md border bg-muted/30 p-3 text-sm">{module.moduleId}</div>)}</div></CardContent>
      </Card>;
    })}</div></section>
    <section className={terminalStage === "hidden" ? "fixed bottom-5 left-1/2 z-50 -translate-x-1/2" : terminalStage === "partial" ? "fixed inset-x-0 bottom-4 z-50 mx-auto h-72 w-[min(96vw,1480px)] overflow-hidden border border-border bg-[#0c0e11] shadow-2xl" : "fixed inset-x-0 bottom-0 z-50 h-[72vh] border-t border-border bg-[#0c0e11] shadow-2xl"}>
      {terminalStage === "hidden" ? <button className="grid size-9 place-items-center rounded-full border border-border bg-[#0c0e11] font-mono text-sm text-foreground shadow-lg" aria-label="Open terminal" onClick={() => setTerminalStage("partial")}> &gt;_ </button> : <><button className="absolute inset-x-0 top-0 z-10 grid h-6 place-items-center bg-[#0c0e11] font-mono text-[11px] text-muted-foreground" aria-label={terminalStage === "partial" ? "Expand terminal" : "Hide terminal"} onClick={() => setTerminalStage(stage => stage === "partial" ? "full" : "hidden")}> &gt;_ </button><div className="h-full px-3 pb-3 pt-7" onClick={() => terminal.current?.focus()}><div ref={terminalHost} className="h-full" /></div></>}</section>
  </main>;
}
createRoot(document.getElementById("root")!).render(<App />);
