import type { WorkspaceInspection } from "@ai-mo-to/engine";
import { WorkspaceEngine } from "@ai-mo-to/engine";
import { runCli } from "@ai-mo-to/cli";
import { createRequire } from "node:module";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DesktopApi } from "./contracts.js";

/** Minimal Electron-shaped API. Kept structural so the domain code stays testable without Electron. */
export interface ElectronMainRuntime {
  ipcMain: { handle(channel: string, listener: (...args: unknown[]) => unknown): void };
  dialog: { showOpenDialog(options: { properties: string[] }): Promise<{ canceled: boolean; filePaths: string[] }> };
  BrowserWindow: new (options: { webPreferences: { contextIsolation: true; sandbox: true; preload: string } }) => { loadFile(file: string): Promise<void> };
}

/** Implemented by WorkspaceEngine; structural typing keeps Electron tests free of storage runtime. */
export interface WorkspaceInspector {
  inspectWorkspace(root: string): Promise<WorkspaceInspection>;
}

interface WorkspaceCreator extends WorkspaceInspector {
  createWorkspace(input: { root: string; name: string; workspaceId: string }): Promise<WorkspaceInspection>;
}

interface DesktopWorkspaceEngine extends WorkspaceInspector {
  listBuiltInRecords(root: string, moduleId: "aimoto.files" | "aimoto.tasks"): Promise<readonly unknown[]>;
  executeBuiltInCommand(input: {
    root: string; moduleId: string; command: string; input: Record<string, unknown>;
  }): Promise<unknown>;
  listInstalledModuleViews(root: string, moduleId: string): Promise<readonly unknown[]>;
  listInstalledModuleRecords(root: string, moduleId: string, collectionId: string): Promise<readonly unknown[]>;
}

/** A product-owned path, stable across launches and distinct from user-selected workspaces. */
export function defaultWorkspaceRoot(userDataPath: string): string {
  return join(userDataPath, "workspaces", "default");
}

/** Reads the explicit workspace passed by `aimoto open`; unrelated Electron flags are ignored. */
export function workspaceRootFromArgs(args: readonly string[]): string | undefined {
  const index = args.indexOf("--workspace");
  const root = index >= 0 ? args[index + 1] : undefined;
  if (index >= 0 && (!root || root.startsWith("--"))) {
    throw new Error("--workspace requires a directory path.");
  }
  return root;
}

/** Resolve a workspace ID/name from the product-owned registry before treating
 * the argument as a filesystem path. */
export async function resolveWorkspaceLaunchTarget(value: string, userDataPath: string): Promise<string> {
  // Electron's userData is normally Roaming on Windows, while AI-Mo-To's
  // canonical workspace store is LocalAppData. Keep registry lookup aligned
  // with the CLI rather than silently treating an ID as a literal path.
  const storageRoot = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "AI-Mo-To")
    : userDataPath;
  const registryPath = join(storageRoot, "workspaces", "registry.json");
  try {
    const registry = JSON.parse(await readFile(registryPath, "utf8")) as { workspaces?: Array<{ id: string; name: string; root: string }> };
    const normalized = value.toLowerCase();
    const match = (registry.workspaces ?? []).find(entry => entry.id.toLowerCase() === normalized || entry.name.toLowerCase() === normalized);
    if (match) {
      await access(join(match.root, ".aimoto", "workspace.json"));
      return match.root;
    }
  } catch {
    // A literal path remains a supported advanced override.
  }
  return value;
}

/** Opens the stable first-run workspace, creating it only when it does not yet exist. */
export async function openOrCreateDefaultWorkspace(engine: WorkspaceCreator, userDataPath: string): Promise<WorkspaceInspection> {
  const root = defaultWorkspaceRoot(userDataPath);
  try {
    return await engine.inspectWorkspace(root);
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "WorkspaceNotFound")) throw error;
  }
  return engine.createWorkspace({ root, name: "My AI-Mo-To Workspace", workspaceId: "default" });
}

export function createDesktopApi(engine: DesktopWorkspaceEngine): DesktopApi {
  return {
    async openDefaultWorkspace(): Promise<WorkspaceInspection> {
      throw new Error("openDefaultWorkspace must be provided by the Electron main process.");
    },
    async selectWorkspace(): Promise<WorkspaceInspection | undefined> {
      throw new Error("selectWorkspace must be provided by the Electron main process.");
    },
    inspectWorkspace: (root) => engine.inspectWorkspace(root),
    listRecords: (root, moduleId, collectionId) =>
      (moduleId === "aimoto.files" || moduleId === "aimoto.tasks"
        ? engine.listBuiltInRecords(root, moduleId as "aimoto.files" | "aimoto.tasks")
        : engine.listInstalledModuleRecords(root, moduleId, collectionId ?? "items")) as ReturnType<DesktopApi["listRecords"]>,
    executeCommand: (input) =>
      engine.executeBuiltInCommand(input as Parameters<typeof engine.executeBuiltInCommand>[0]) as ReturnType<DesktopApi["executeCommand"]>,
    listModuleViews: (root, moduleId) => engine.listInstalledModuleViews(root, moduleId) as ReturnType<DesktopApi["listModuleViews"]>,
    requestOutcome: async (root, request) => {
      let stdout = "";
      const io = { stdout: (m: string) => { stdout += m; }, stderr: () => {} };
      await runCli(["request", request, "--workspace", root, "--json"], io);
      const envelope = JSON.parse(stdout);
      if (!envelope.ok) throw new Error(envelope.error?.message ?? "Request failed");
      return {
        request,
        plan: {
          displayName: envelope.data.plan.displayName,
          userOutcomes: envelope.data.plan.userOutcomes
        },
        proposal: {
          proposalId: envelope.data.proposal.proposalId,
          changeSetDigest: envelope.data.proposal.changeSetDigest
        }
      };
    },
    applyProposal: async (root, proposalId, digest) => {
      let stdout = "";
      const io = { stdout: (m: string) => { stdout += m; }, stderr: () => {} };
      await runCli(["apply", "--workspace", root, "--proposal", proposalId, "--hash", digest, "--json"], io);
      return engine.inspectWorkspace(root);
    },
    createTerminal: async (root) => ({ sessionId: `term-stub-${root.length}` }),
    writeTerminal: async () => {},
    onTerminalData: () => {},
    resizeTerminal: async () => {}
  };
}

export function registerDesktopIpc(runtime: ElectronMainRuntime, engine: DesktopWorkspaceEngine, defaultWorkspace?: WorkspaceInspection): void {
  runtime.ipcMain.handle("workspace:default", async () => {
    if (!defaultWorkspace) throw new Error("The default workspace has not been initialized.");
    return engine.inspectWorkspace(defaultWorkspace.root);
  });
  runtime.ipcMain.handle("workspace:inspect", async (_event: unknown, root: unknown) => {
    if (typeof root !== "string") throw new Error("workspace root must be a string");
    return engine.inspectWorkspace(root);
  });
  runtime.ipcMain.handle("workspace:select", async () => {
    const result = await runtime.dialog.showOpenDialog({ properties: ["openDirectory"] });
    const root = result.filePaths[0];
    return result.canceled || !root ? undefined : engine.inspectWorkspace(root);
  });
  runtime.ipcMain.handle("workspace:request", async (_event: unknown, root: unknown, request: unknown) => {
    if (typeof root !== "string" || typeof request !== "string") throw new Error("workspace root and request must be strings");
    let stdout = "";
    const io = { stdout: (m: string) => { stdout += m; }, stderr: () => {} };
    await runCli(["request", request, "--workspace", root, "--json"], io);
    const envelope = JSON.parse(stdout);
    if (!envelope.ok) throw new Error(envelope.error?.message ?? "Request failed");
    return {
      request,
      plan: {
        displayName: envelope.data.plan.displayName,
        userOutcomes: envelope.data.plan.userOutcomes
      },
      proposal: {
        proposalId: envelope.data.proposal.proposalId,
        changeSetDigest: envelope.data.proposal.changeSetDigest
      }
    };
  });
  runtime.ipcMain.handle("workspace:apply", async (_event: unknown, root: unknown, proposalId: unknown, digest: unknown) => {
    if (typeof root !== "string" || typeof proposalId !== "string" || typeof digest !== "string") {
      throw new Error("workspace root, proposalId, and digest must be strings");
    }
    let stdout = "";
    const io = { stdout: (m: string) => { stdout += m; }, stderr: () => {} };
    await runCli(["apply", "--workspace", root, "--proposal", proposalId, "--hash", digest, "--json"], io);
    return engine.inspectWorkspace(root);
  });
  runtime.ipcMain.handle("records:list", async (_event: unknown, root: unknown, moduleId: unknown, collectionId?: unknown) => {
    if (typeof root !== "string" || typeof moduleId !== "string") throw new Error("workspace root and module id must be strings");
    if (moduleId === "aimoto.files" || moduleId === "aimoto.tasks") {
      return engine.listBuiltInRecords(root, moduleId);
    }
    return engine.listInstalledModuleRecords(root, moduleId, typeof collectionId === "string" ? collectionId : "items");
  });
  runtime.ipcMain.handle("records:execute", async (_event: unknown, input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("command input must be an object");
    const command = input as Parameters<DesktopWorkspaceEngine["executeBuiltInCommand"]>[0];
    return engine.executeBuiltInCommand(command);
  });
  runtime.ipcMain.handle("module:views", async (_event: unknown, root: unknown, moduleId: unknown) => {
    if (typeof root !== "string" || typeof moduleId !== "string") throw new Error("workspace root and module id must be strings");
    return engine.listInstalledModuleViews(root, moduleId);
  });

  const activeTerminals = new Map<string, any>();
  runtime.ipcMain.handle("terminal:create", async (event: any, root: unknown) => {
    const cwd = typeof root === "string" ? root : process.cwd();
    const sessionId = `term-${Math.random().toString(36).slice(2, 9)}`;
    const shell = process.platform === "win32" ? "powershell.exe" : (process.env.SHELL || "bash");
    
    try {
      const { spawn } = await import("node:child_process");
      const proc = spawn(shell, process.platform === "win32" ? ["-NoLogo"] : [], {
        cwd,
        env: { ...process.env, TERM: "xterm-256color" },
        stdio: ["pipe", "pipe", "pipe"]
      });
      
      const sender = event?.sender;
      proc.stdout.on("data", (chunk: Buffer) => {
        sender?.send?.("terminal:data", { sessionId, chunk: chunk.toString("utf8") });
      });
      proc.stderr.on("data", (chunk: Buffer) => {
        sender?.send?.("terminal:data", { sessionId, chunk: chunk.toString("utf8") });
      });

      activeTerminals.set(sessionId, proc);
      return { sessionId };
    } catch (err: any) {
      throw new Error(`Failed to launch terminal process: ${err?.message || err}`);
    }
  });

  runtime.ipcMain.handle("terminal:write", async (_event: unknown, sessionId: unknown, data: unknown) => {
    if (typeof sessionId !== "string" || typeof data !== "string") return;
    const proc = activeTerminals.get(sessionId);
    if (proc && proc.stdin && !proc.stdin.destroyed) {
      proc.stdin.write(data);
    }
  });

  runtime.ipcMain.handle("terminal:resize", async () => {
    // Resize dimensions handled by xterm fit addon
    return { ok: true };
  });
}

/** Creates the secure renderer window after the host application has reached Electron's ready state. */
export async function openDesktopWindow(
  runtime: ElectronMainRuntime,
  paths: { preload: string; renderer: string }
): Promise<void> {
  const window = new runtime.BrowserWindow({
    webPreferences: { contextIsolation: true, sandbox: true, preload: paths.preload }
  });
  await window.loadFile(paths.renderer);
}

interface ElectronApplication {
  whenReady(): Promise<void>;
  getPath(name: "userData"): string;
  isPackaged: boolean;
  on(event: "activate" | "window-all-closed", listener: () => void): void;
  quit(): void;
}

interface ElectronRuntime extends ElectronMainRuntime { app: ElectronApplication; }

type CliProcess = {
  stdout: { write(chunk: string, callback?: (error?: Error | null) => void): boolean };
  stderr: { write(chunk: string, callback?: (error?: Error | null) => void): boolean };
  exit(code?: number): never;
};

function flush(stream: CliProcess["stdout"]): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write("", (error) => error ? reject(error) : resolve());
  });
}

/**
 * Electron keeps application lifecycle state and may still have GUI descendants
 * after an `open` command. Force the short-lived `--cli` host itself to end once
 * its redirected output is flushed; the independently detached desktop remains.
 */
export async function exitElectronCli(exitCode: number, cliProcess: CliProcess = process): Promise<never> {
  await Promise.all([flush(cliProcess.stdout), flush(cliProcess.stderr)]);
  return cliProcess.exit(exitCode);
}

/**
 * Points engine operations at Electron's unpacked product resources.
 * This must run for both the graphical app and `AI-Mo-To.exe --cli`; the CLI
 * can create workspaces before Electron reaches its ready state.
 */
export function configurePackagedResources(
  isPackaged: boolean,
  resourcesPath: string | undefined,
  environment: NodeJS.ProcessEnv = process.env
): void {
  if (isPackaged && resourcesPath) {
    environment.AIMOTO_BUILTIN_MODULES_DIR = join(resourcesPath, "modules");
  }
}

/** Starts the real Electron app while preserving a small, testable boundary around Electron itself. */
export async function launchDesktop(): Promise<void> {
  const require = createRequire(import.meta.url);
  const runtime = require("electron") as ElectronRuntime;
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  configurePackagedResources(runtime.app.isPackaged, resourcesPath);
  const engine = new WorkspaceEngine();
  await runtime.app.whenReady();
  const requestedValue = process.env.AIMOTO_LAUNCH_WORKSPACE ?? workspaceRootFromArgs(process.argv);
  const requestedRoot = requestedValue
    ? await resolveWorkspaceLaunchTarget(requestedValue, runtime.app.getPath("userData"))
    : undefined;
  const initialWorkspace = requestedRoot
    ? await engine.inspectWorkspace(requestedRoot)
    : await openOrCreateDefaultWorkspace(engine, runtime.app.getPath("userData"));
  registerDesktopIpc(runtime, engine, initialWorkspace);
  // Sandboxed Electron preload scripts run as CommonJS regardless of the
  // package's ESM setting. Use a dedicated bridge artifact in packaged builds.
  const preload = fileURLToPath(new URL("./preload.cjs", import.meta.url));
  const renderer = fileURLToPath(new URL("./renderer.html", import.meta.url));
  await openDesktopWindow(runtime, { preload, renderer });
  runtime.app.on("activate", () => { void openDesktopWindow(runtime, { preload, renderer }); });
  runtime.app.on("window-all-closed", () => { if (process.platform !== "darwin") runtime.app.quit(); });
}

if (process.versions.electron) {
  const require = createRequire(import.meta.url);
  const { app } = require("electron") as { app: ElectronApplication };
  configurePackagedResources(
    app.isPackaged,
    (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  );
  const cliMarker = process.argv.indexOf("--cli");
  if (cliMarker >= 0) {
    void runCli(process.argv.slice(cliMarker + 1), {
      stdout: (message) => process.stdout.write(`${message}\n`),
      stderr: (message) => process.stderr.write(`${message}\n`)
    }, {
      // A per-user NSIS install may live anywhere the user selected. The
      // packaged CLI can always relaunch its own executable without guessing
      // the installation directory or interpolating it into a shell command.
      runtimeExecutable: process.execPath
    }).then((exitCode) => {
      return exitElectronCli(exitCode);
    }).catch((error: unknown) => {
      console.error("AI-Mo-To CLI could not finish.", error);
      process.exit(1);
    });
  } else {
    void launchDesktop().catch((error: unknown) => {
      console.error("AI-Mo-To desktop could not start.", error);
      process.exitCode = 1;
    });
  }
}
