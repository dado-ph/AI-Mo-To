import type { ImplementationBrief, WorkspaceInspection } from "@ai-mo-to/engine";
import { WorkspaceEngine } from "@ai-mo-to/engine";
import { runCli } from "@ai-mo-to/cli";
import { createRequire } from "node:module";
import { access, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { exec } from "node:child_process";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { DesktopApi, DesktopWorkspaceVersion } from "./contracts.js";

/** Minimal Electron-shaped API. Kept structural so the domain code stays testable without Electron. */
export interface ElectronMainRuntime {
  ipcMain: { handle(channel: string, listener: (...args: unknown[]) => unknown): void };
  dialog: { showOpenDialog(options: { defaultPath?: string; properties: string[] }): Promise<{ canceled: boolean; filePaths: string[] }> };
  BrowserWindow: new (options: { webPreferences: { contextIsolation: true; sandbox: true; preload: string } }) => { loadFile(file: string): Promise<void> };
  shell?: { openPath(path: string): Promise<string> };
}

/** Implemented by WorkspaceEngine; structural typing keeps Electron tests free of storage runtime. */
export interface WorkspaceInspector {
  inspectWorkspace(root: string): Promise<WorkspaceInspection>;
}

interface WorkspaceCreator extends WorkspaceInspector {
  createWorkspace(input: { root: string; name: string; workspaceId: string }): Promise<WorkspaceInspection>;
}

interface DesktopWorkspaceEngine extends WorkspaceCreator {
  prepareImplementationRequest(input: { root: string; request: string }): Promise<ImplementationBrief>;
  listWorkspaceVersions(root: string): Promise<readonly DesktopWorkspaceVersion[]>;
  restoreWorkspaceVersion(root: string, versionId: string): Promise<DesktopWorkspaceVersion>;
}

/** The canonical product-owned store. Never derive this from the launch CWD. */
export function workspaceStorageRoot(environment: NodeJS.ProcessEnv = process.env): string {
  const localAppData = environment.LOCALAPPDATA;
  if (!localAppData) {
    throw new Error("LOCALAPPDATA is required to resolve the AI-Mo-To workspace store.");
  }
  return join(localAppData, "AI-Mo-To");
}

/** A product-owned path, stable across launches and distinct from user-selected workspaces. */
export function defaultWorkspaceRoot(storageRoot: string): string {
  return join(storageRoot, "workspaces", "default");
}

/** Only direct children of the product-owned store may be surfaced as workspaces. */
export function isCanonicalWorkspaceRoot(workspacesDir: string, root: string): boolean {
  const pathFromStore = relative(resolve(workspacesDir), resolve(root));
  return Boolean(pathFromStore)
    && pathFromStore !== ".."
    && !pathFromStore.startsWith(`..${sep}`)
    && !isAbsolute(pathFromStore)
    && !pathFromStore.includes(sep);
}

function legacyWorkspaceSlug(value: unknown): string {
  const slug = typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    : "";
  return slug || "migrated-workspace";
}

/**
 * Repairs the pre-v2 layout that wrote a workspace into the store container
 * itself. Its application files and legacy metadata are preserved in a named
 * child workspace before fresh v2 metadata is initialized.
 */
export async function migrateLegacyStoreRoot(storageRoot: string, engine: WorkspaceCreator): Promise<string | undefined> {
  const workspacesDir = join(storageRoot, "workspaces");
  const legacyMetadata = join(workspacesDir, ".aimoto");
  const legacyManifestPath = join(legacyMetadata, "workspace.json");
  let legacyManifest: { schemaVersion?: unknown; workspaceId?: unknown; name?: unknown };
  try {
    legacyManifest = JSON.parse(await readFile(legacyManifestPath, "utf8"));
  } catch {
    return undefined;
  }
  if (legacyManifest.schemaVersion === 2) return undefined;

  const workspaceId = legacyWorkspaceSlug(legacyManifest.workspaceId);
  const name = typeof legacyManifest.name === "string" && legacyManifest.name.trim()
    ? legacyManifest.name.trim()
    : workspaceId;
  const targetRoot = join(workspacesDir, workspaceId);
  try {
    await access(targetRoot);
    return undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  await mkdir(targetRoot, { recursive: true });
  for (const name of ["files", "exports"]) {
    const source = join(workspacesDir, name);
    try {
      await rename(source, join(targetRoot, name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  await rename(legacyMetadata, join(targetRoot, ".aimoto-legacy-v1"));
  await engine.createWorkspace({ root: targetRoot, name, workspaceId });
  return targetRoot;
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
export async function resolveWorkspaceLaunchTarget(value: string): Promise<string> {
  // Electron's userData is normally Roaming on Windows, while AI-Mo-To's
  // canonical workspace store is LocalAppData. Keep registry lookup aligned
  // with the CLI rather than silently treating an ID as a literal path.
  const storageRoot = workspaceStorageRoot();
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

export async function openWorkspaceFolder(root: string, runtime?: ElectronMainRuntime): Promise<void> {
  if (runtime?.shell?.openPath) {
    await runtime.shell.openPath(root);
    return;
  }
  return new Promise((resolve) => {
    const cmd = process.platform === "win32"
      ? `explorer "${root}"`
      : process.platform === "darwin"
      ? `open "${root}"`
      : `xdg-open "${root}"`;
    exec(cmd, () => resolve());
  });
}

/** Returns optional workspace-owned artwork and an app entry page for the shell. */
export async function workspacePresentation(root: string): Promise<{ thumbnailUrl?: string; entryUrl?: string }> {
  const find = async (candidates: readonly string[]) => {
    for (const candidate of candidates) {
      const path = join(root, candidate);
      try { await access(path); return pathToFileURL(path).href; } catch {}
    }
    return undefined;
  };
  const thumbnailUrl = await find([".aimoto/thumbnail.png", "thumbnail.png", "preview.png", "assets/thumbnail.png", "assets/preview.png"]);
  const entryUrl = await find(["index.html", "ui/index.html"]);
  return { ...(thumbnailUrl ? { thumbnailUrl } : {}), ...(entryUrl ? { entryUrl } : {}) };
}

export async function scanAllWorkspaces(storageRoot: string, engine: WorkspaceInspector): Promise<WorkspaceInspection[]> {
  const workspacesDir = join(storageRoot, "workspaces");
  const registryPath = join(workspacesDir, "registry.json");
  const candidateRoots = new Set<string>();

  candidateRoots.add(defaultWorkspaceRoot(storageRoot));

  try {
    const registryRaw = await readFile(registryPath, "utf8");
    const registry = JSON.parse(registryRaw) as { workspaces?: Array<{ root: string }> };
    for (const entry of registry.workspaces ?? []) {
      if (entry?.root && isCanonicalWorkspaceRoot(workspacesDir, entry.root)) candidateRoots.add(entry.root);
    }
  } catch {}

  try {
    const entries = await readdir(workspacesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        candidateRoots.add(join(workspacesDir, entry.name));
      }
    }
  } catch {}

  const results: WorkspaceInspection[] = [];
  const validRegistrations: Array<{ id: string; name: string; root: string; updatedAt: string }> = [];

  for (const root of candidateRoots) {
    try {
      await access(join(root, ".aimoto", "workspace.json"));
      const inspection = await engine.inspectWorkspace(root);
      results.push(inspection);
      validRegistrations.push({
        id: inspection.workspaceId,
        name: inspection.name,
        root: inspection.root,
        updatedAt: new Date().toISOString()
      });
    } catch {}
  }

  try {
    await mkdir(workspacesDir, { recursive: true });
    await writeFile(registryPath, JSON.stringify({ version: 1, workspaces: validRegistrations }, null, 2) + "\n", "utf8");
  } catch {}

  return results;
}

/** Opens the stable first-run workspace, creating it only when it does not yet exist. */
export async function openOrCreateDefaultWorkspace(engine: WorkspaceCreator, storageRoot: string): Promise<WorkspaceInspection> {
  const root = defaultWorkspaceRoot(storageRoot);
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
    listAllWorkspaces: async () => [],
    getWorkspacePresentation: async () => ({}),
    openWorkspaceFolder: async (root) => { await openWorkspaceFolder(root); },
    createWorkspace: async (name, rootPath) => {
      const root = rootPath ?? join(workspaceStorageRoot(), "workspaces", name.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
      return engine.createWorkspace({ root, name, workspaceId: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") });
    },
    renameWorkspace: async (root, newName) => {
      const manifestPath = join(root, ".aimoto", "workspace.json");
      const current = JSON.parse(await readFile(manifestPath, "utf8"));
      current.name = newName;
      await writeFile(manifestPath, JSON.stringify(current, null, 2) + "\n", "utf8");
      return engine.inspectWorkspace(root);
    },
    deleteWorkspace: async () => {},
    requestImplementation: (root, request) => engine.prepareImplementationRequest({ root, request }),
    listWorkspaceVersions: (root) => engine.listWorkspaceVersions(root),
    restoreWorkspaceVersion: (root, versionId) => engine.restoreWorkspaceVersion(root, versionId),
    createTerminal: async (root) => ({ sessionId: `term-stub-${root?.length ?? 0}` }),
    writeTerminal: async () => {},
    closeTerminal: async () => {},
    onTerminalData: () => () => {},
    resizeTerminal: async () => {}
  };
}

export function registerDesktopIpc(runtime: ElectronMainRuntime, engine: DesktopWorkspaceEngine, defaultWorkspace?: WorkspaceInspection): void {
  const storageRoot = workspaceStorageRoot();
  runtime.ipcMain.handle("workspace:default", async () => {
    if (!defaultWorkspace) throw new Error("The default workspace has not been initialized.");
    return engine.inspectWorkspace(defaultWorkspace.root);
  });
  runtime.ipcMain.handle("workspace:inspect", async (_event: unknown, root: unknown) => {
    if (typeof root !== "string") throw new Error("workspace root must be a string");
    return engine.inspectWorkspace(root);
  });
  runtime.ipcMain.handle("workspace:listAll", async () => {
    return scanAllWorkspaces(storageRoot, engine);
  });
  runtime.ipcMain.handle("workspace:presentation", async (_event: unknown, root: unknown) => {
    if (typeof root !== "string") throw new Error("workspace root must be a string");
    return workspacePresentation(root);
  });
  runtime.ipcMain.handle("workspace:openFolder", async (_event: unknown, root: unknown) => {
    if (typeof root !== "string") throw new Error("workspace root must be a string");
    return openWorkspaceFolder(root, runtime);
  });
  runtime.ipcMain.handle("workspace:create", async (_event: unknown, name: unknown, rootPath?: unknown) => {
    if (typeof name !== "string" || !name.trim()) throw new Error("workspace name is required");
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const root = typeof rootPath === "string" && rootPath.trim() ? rootPath.trim() : join(storageRoot, "workspaces", slug);
    await engine.createWorkspace({ root, name: name.trim(), workspaceId: slug });
    await scanAllWorkspaces(storageRoot, engine);
    return engine.inspectWorkspace(root);
  });
  runtime.ipcMain.handle("workspace:rename", async (_event: unknown, root: unknown, newName: unknown) => {
    if (typeof root !== "string" || typeof newName !== "string" || !newName.trim()) throw new Error("root and newName required");
    const manifestPath = join(root, ".aimoto", "workspace.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.name = newName.trim();
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    await scanAllWorkspaces(storageRoot, engine);
    return engine.inspectWorkspace(root);
  });
  runtime.ipcMain.handle("workspace:delete", async (_event: unknown, root: unknown) => {
    if (typeof root !== "string") throw new Error("workspace root must be a string");
    const registryPath = join(storageRoot, "workspaces", "registry.json");
    try {
      const raw = await readFile(registryPath, "utf8");
      const registry = JSON.parse(raw) as { workspaces?: Array<{ root: string }> };
      if (registry.workspaces) {
        registry.workspaces = registry.workspaces.filter(e => e.root !== root);
        await writeFile(registryPath, JSON.stringify(registry, null, 2) + "\n", "utf8");
      }
    } catch {}
    return { ok: true };
  });
  runtime.ipcMain.handle("workspace:select", async () => {
    const defaultPath = join(storageRoot, "workspaces");
    const result = await runtime.dialog.showOpenDialog({ defaultPath, properties: ["openDirectory"] });
    const root = result.filePaths[0];
    return result.canceled || !root ? undefined : engine.inspectWorkspace(root);
  });
  runtime.ipcMain.handle("workspace:request", async (_event: unknown, root: unknown, request: unknown) => {
    if (typeof root !== "string" || typeof request !== "string") throw new Error("workspace root and request must be strings");
    return engine.prepareImplementationRequest({ root, request });
  });
  runtime.ipcMain.handle("versions:list", async (_event: unknown, root: unknown) => {
    if (typeof root !== "string") throw new Error("workspace root must be a string");
    return engine.listWorkspaceVersions(root);
  });
  runtime.ipcMain.handle("versions:restore", async (_event: unknown, root: unknown, versionId: unknown) => {
    if (typeof root !== "string" || typeof versionId !== "string") {
      throw new Error("workspace root and version id must be strings");
    }
    return engine.restoreWorkspaceVersion(root, versionId);
  });

  const activeTerminals = new Map<string, any>();
  runtime.ipcMain.handle("terminal:create", async (event: any, root: unknown) => {
    const cwd = typeof root === "string" && root.length > 0
      ? root
      : join(workspaceStorageRoot(), "workspaces");
    const sessionId = `term-${Math.random().toString(36).slice(2, 9)}`;
    const shell = process.platform === "win32" ? "powershell.exe" : (process.env.SHELL || "bash");
    const sender = event?.sender;
    
    try {
      const pty = await import("node-pty");
      const proc = pty.spawn(shell, [], {
        name: "xterm-256color",
        cols: 80,
        rows: 24,
        cwd,
        env: process.env as Record<string, string>,
        useConpty: process.platform === "win32"
      });

      proc.onData((data: string) => {
        sender?.send?.("terminal:data", { sessionId, chunk: data });
      });

      proc.onExit(() => activeTerminals.delete(sessionId));
      activeTerminals.set(sessionId, { type: "pty", proc });
      return { sessionId };
    } catch {
      const { spawn } = await import("node:child_process");
      const proc = spawn(shell, process.platform === "win32" ? ["-NoLogo"] : [], {
        cwd,
        env: { ...process.env, TERM: "xterm-256color" },
        stdio: ["pipe", "pipe", "pipe"]
      });
      
      proc.stdout.on("data", (chunk: Buffer) => {
        sender?.send?.("terminal:data", { sessionId, chunk: chunk.toString("utf8") });
      });
      proc.stderr.on("data", (chunk: Buffer) => {
        sender?.send?.("terminal:data", { sessionId, chunk: chunk.toString("utf8") });
      });

      proc.on("close", () => activeTerminals.delete(sessionId));
      activeTerminals.set(sessionId, { type: "pipe", proc });
      return { sessionId };
    }
  });

  runtime.ipcMain.handle("terminal:write", async (_event: unknown, sessionId: unknown, data: unknown) => {
    if (typeof sessionId !== "string" || typeof data !== "string") return;
    const target = activeTerminals.get(sessionId);
    if (!target) return;
    if (target.type === "pty") {
      target.proc.write(data);
    } else if (target.proc && target.proc.stdin && !target.proc.stdin.destroyed) {
      target.proc.stdin.write(data);
    }
  });

  runtime.ipcMain.handle("terminal:close", async (_event: unknown, sessionId: unknown) => {
    if (typeof sessionId !== "string") return;
    const target = activeTerminals.get(sessionId);
    if (!target) return;
    activeTerminals.delete(sessionId);
    try {
      if (target.type === "pty") target.proc.kill();
      else target.proc.kill();
    } catch {}
  });

  runtime.ipcMain.handle("terminal:resize", async (_event: unknown, sessionId: unknown, cols: unknown, rows: unknown) => {
    if (typeof sessionId !== "string") return { ok: true };
    const target = activeTerminals.get(sessionId);
    if (target && target.type === "pty" && typeof cols === "number" && typeof rows === "number") {
      try { target.proc.resize(cols, rows); } catch {}
    }
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

/** Starts the real Electron app while preserving a small, testable boundary around Electron itself. */
export async function launchDesktop(): Promise<void> {
  const require = createRequire(import.meta.url);
  const runtime = require("electron") as ElectronRuntime;
  const engine = new WorkspaceEngine();
  await runtime.app.whenReady();
  await migrateLegacyStoreRoot(workspaceStorageRoot(), engine);
  const requestedValue = process.env.AIMOTO_LAUNCH_WORKSPACE ?? workspaceRootFromArgs(process.argv);
  const requestedRoot = requestedValue
    ? await resolveWorkspaceLaunchTarget(requestedValue)
    : undefined;
  // The desktop shell never invents a workspace. A workspace is opened only
  // when the person explicitly selects one or launches with --workspace.
  const initialWorkspace = requestedRoot
    ? await engine.inspectWorkspace(requestedRoot)
    : undefined;
  registerDesktopIpc(runtime, engine, initialWorkspace);
  // Sandboxed Electron preload scripts run as CommonJS regardless of the
  // package's ESM setting. Use a dedicated bridge artifact in packaged builds.
  const preload = fileURLToPath(new URL("./preload.cjs", import.meta.url));
  const renderer = fileURLToPath(new URL("./src/renderer-shadcn.html", import.meta.url));
  await openDesktopWindow(runtime, { preload, renderer });
  runtime.app.on("activate", () => { void openDesktopWindow(runtime, { preload, renderer }); });
  runtime.app.on("window-all-closed", () => { if (process.platform !== "darwin") runtime.app.quit(); });
}

if (process.versions.electron) {
  const require = createRequire(import.meta.url);
  const { app } = require("electron") as { app: ElectronApplication };
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
