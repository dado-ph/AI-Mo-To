import type { WorkspaceInspection } from "@ai-mo-to/engine";
import { WorkspaceEngine } from "@ai-mo-to/engine";
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

/** A product-owned path, stable across launches and distinct from user-selected workspaces. */
export function defaultWorkspaceRoot(userDataPath: string): string {
  return join(userDataPath, "workspaces", "default");
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

export function createDesktopApi(engine: WorkspaceInspector): DesktopApi {
  return {
    async openDefaultWorkspace(): Promise<WorkspaceInspection> {
      throw new Error("openDefaultWorkspace must be provided by the Electron main process.");
    },
    async selectWorkspace(): Promise<WorkspaceInspection | undefined> {
      throw new Error("selectWorkspace must be provided by the Electron main process.");
    },
    inspectWorkspace: (root) => engine.inspectWorkspace(root)
  };
}

export function registerDesktopIpc(runtime: ElectronMainRuntime, engine: WorkspaceInspector, defaultWorkspace?: WorkspaceInspection): void {
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

/** Starts the real Electron app while preserving a small, testable boundary around Electron itself. */
export async function launchDesktop(): Promise<void> {
  const require = createRequire(import.meta.url);
  const runtime = require("electron") as ElectronRuntime;
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (runtime.app.isPackaged && resourcesPath) process.env.AIMOTO_BUILTIN_MODULES_DIR = join(resourcesPath, "modules");
  const engine = new WorkspaceEngine();
  await runtime.app.whenReady();
  const defaultWorkspace = await openOrCreateDefaultWorkspace(engine, runtime.app.getPath("userData"));
  registerDesktopIpc(runtime, engine, defaultWorkspace);
  const preload = fileURLToPath(new URL("./preload.js", import.meta.url));
  const renderer = fileURLToPath(new URL("./renderer.html", import.meta.url));
  await openDesktopWindow(runtime, { preload, renderer });
  runtime.app.on("activate", () => { void openDesktopWindow(runtime, { preload, renderer }); });
  runtime.app.on("window-all-closed", () => { if (process.platform !== "darwin") runtime.app.quit(); });
}

if (process.versions.electron) {
  void launchDesktop().catch((error: unknown) => {
    console.error("AI-Mo-To desktop could not start.", error);
    process.exitCode = 1;
  });
}
