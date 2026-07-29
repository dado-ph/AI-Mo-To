import type { WorkspaceInspection } from "@ai-mo-to/engine";
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

export function createDesktopApi(engine: WorkspaceInspector): DesktopApi {
  return {
    async selectWorkspace(): Promise<WorkspaceInspection | undefined> {
      throw new Error("selectWorkspace must be provided by the Electron main process.");
    },
    inspectWorkspace: (root) => engine.inspectWorkspace(root)
  };
}

export function registerDesktopIpc(runtime: ElectronMainRuntime, engine: WorkspaceInspector): void {
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
