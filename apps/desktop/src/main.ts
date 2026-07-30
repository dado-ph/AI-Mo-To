import type { WorkspaceInspection } from "@ai-mo-to/engine";
import { WorkspaceEngine } from "@ai-mo-to/engine";
import { runCli } from "@ai-mo-to/cli";
import { createRequire } from "node:module";
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
    root: string; moduleId: "aimoto.files" | "aimoto.tasks"; command: string; input: Record<string, unknown>;
  }): Promise<unknown>;
  listInstalledModuleViews(root: string, moduleId: string): Promise<readonly unknown[]>;
  listHabitTrackerRecords(root: string, collectionId: "habit" | "habit-entry"): Promise<readonly unknown[]>;
  executeHabitTrackerCommand(input: { root: string; command: "create-habit" | "log-completion"; input: Record<string, unknown> }): Promise<unknown>;
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
    listRecords: (root, moduleId) => engine.listBuiltInRecords(root, moduleId) as ReturnType<DesktopApi["listRecords"]>,
    executeCommand: (input) => engine.executeBuiltInCommand(input) as ReturnType<DesktopApi["executeCommand"]>
    ,listModuleViews: (root, moduleId) => engine.listInstalledModuleViews(root, moduleId) as ReturnType<DesktopApi["listModuleViews"]>
    ,listHabitRecords: (root, collectionId) => engine.listHabitTrackerRecords(root, collectionId) as ReturnType<DesktopApi["listHabitRecords"]>
    ,executeHabitCommand: (input) => engine.executeHabitTrackerCommand(input) as ReturnType<DesktopApi["executeHabitCommand"]>
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
  runtime.ipcMain.handle("records:list", async (_event: unknown, root: unknown, moduleId: unknown) => {
    if (typeof root !== "string") throw new Error("workspace root must be a string");
    if (moduleId !== "aimoto.files" && moduleId !== "aimoto.tasks") throw new Error("unknown built-in module");
    return engine.listBuiltInRecords(root, moduleId);
  });
  runtime.ipcMain.handle("records:execute", async (_event: unknown, input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("command input must be an object");
    const command = input as Parameters<DesktopWorkspaceEngine["executeBuiltInCommand"]>[0];
    if (command.moduleId !== "aimoto.files" && command.moduleId !== "aimoto.tasks") throw new Error("unknown built-in module");
    return engine.executeBuiltInCommand(command);
  });
  runtime.ipcMain.handle("module:views", async (_event: unknown, root: unknown, moduleId: unknown) => {
    if (typeof root !== "string" || typeof moduleId !== "string") throw new Error("workspace root and module id must be strings");
    return engine.listInstalledModuleViews(root, moduleId);
  });
  runtime.ipcMain.handle("habits:list", async (_event: unknown, root: unknown, collectionId: unknown) => {
    if (typeof root !== "string" || (collectionId !== "habit" && collectionId !== "habit-entry")) throw new Error("invalid Habit Tracker record request");
    return engine.listHabitTrackerRecords(root, collectionId);
  });
  runtime.ipcMain.handle("habits:execute", async (_event: unknown, input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("command input must be an object");
    return engine.executeHabitTrackerCommand(input as Parameters<DesktopWorkspaceEngine["executeHabitTrackerCommand"]>[0]);
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
  const requestedRoot = process.env.AIMOTO_LAUNCH_WORKSPACE ?? workspaceRootFromArgs(process.argv);
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
