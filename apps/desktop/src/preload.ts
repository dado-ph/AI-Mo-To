import type { DesktopApi } from "./contracts.js";
import { createRequire } from "node:module";

export interface ElectronBridge {
  contextBridge: { exposeInMainWorld(key: string, api: DesktopApi): void };
  ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
    on?(channel: string, listener: (_event: unknown, ...args: unknown[]) => void): void;
  };
}

/** Exposes only typed, allow-listed operations; the renderer never receives Node/Electron globals. */
export function exposeDesktopApi(bridge: ElectronBridge): void {
  const terminalListeners: Array<(data: { sessionId: string; chunk: string }) => void> = [];
  if (bridge.ipcRenderer.on) {
    bridge.ipcRenderer.on("terminal:data", (_event, data) => {
      for (const listener of terminalListeners) listener(data as { sessionId: string; chunk: string });
    });
  }

  const api: DesktopApi = {
    openDefaultWorkspace: () => bridge.ipcRenderer.invoke("workspace:default") as ReturnType<DesktopApi["openDefaultWorkspace"]>,
    selectWorkspace: () => bridge.ipcRenderer.invoke("workspace:select") as ReturnType<DesktopApi["selectWorkspace"]>,
    inspectWorkspace: (root) => bridge.ipcRenderer.invoke("workspace:inspect", root) as ReturnType<DesktopApi["inspectWorkspace"]>,
    listAllWorkspaces: () => bridge.ipcRenderer.invoke("workspace:listAll") as ReturnType<DesktopApi["listAllWorkspaces"]>,
    openWorkspaceFolder: (root) => bridge.ipcRenderer.invoke("workspace:openFolder", root) as ReturnType<DesktopApi["openWorkspaceFolder"]>,
    createWorkspace: (name, rootPath) => bridge.ipcRenderer.invoke("workspace:create", name, rootPath) as ReturnType<DesktopApi["createWorkspace"]>,
    renameWorkspace: (root, newName) => bridge.ipcRenderer.invoke("workspace:rename", root, newName) as ReturnType<DesktopApi["renameWorkspace"]>,
    deleteWorkspace: (root) => bridge.ipcRenderer.invoke("workspace:delete", root) as ReturnType<DesktopApi["deleteWorkspace"]>,
    requestImplementation: (root, request) => bridge.ipcRenderer.invoke("workspace:request", root, request) as ReturnType<DesktopApi["requestImplementation"]>,
    listWorkspaceVersions: (root) => bridge.ipcRenderer.invoke("versions:list", root) as ReturnType<DesktopApi["listWorkspaceVersions"]>,
    restoreWorkspaceVersion: (root, versionId) => bridge.ipcRenderer.invoke("versions:restore", root, versionId) as ReturnType<DesktopApi["restoreWorkspaceVersion"]>,
    createTerminal: (root) => bridge.ipcRenderer.invoke("terminal:create", root) as ReturnType<DesktopApi["createTerminal"]>,
    writeTerminal: (sessionId, data) => bridge.ipcRenderer.invoke("terminal:write", sessionId, data) as ReturnType<DesktopApi["writeTerminal"]>,
    onTerminalData: (listener) => { terminalListeners.push(listener); },
    resizeTerminal: (sessionId, cols, rows) => bridge.ipcRenderer.invoke("terminal:resize", sessionId, cols, rows) as ReturnType<DesktopApi["resizeTerminal"]>
  };
  bridge.contextBridge.exposeInMainWorld("aimoto", api);
}

/** Electron loads this module directly; tests can still exercise the bridge with a structural fake. */
if (process.versions.electron) {
  const require = createRequire(import.meta.url);
  const electron = require("electron") as ElectronBridge;
  exposeDesktopApi(electron);
}
