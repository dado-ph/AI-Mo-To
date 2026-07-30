import type { DesktopApi } from "./contracts.js";
import { createRequire } from "node:module";

export interface ElectronBridge {
  contextBridge: { exposeInMainWorld(key: string, api: DesktopApi): void };
  ipcRenderer: { invoke(channel: string, ...args: unknown[]): Promise<unknown> };
}

/** Exposes only typed, allow-listed operations; the renderer never receives Node/Electron globals. */
export function exposeDesktopApi(bridge: ElectronBridge): void {
  const api: DesktopApi = {
    openDefaultWorkspace: () => bridge.ipcRenderer.invoke("workspace:default") as ReturnType<DesktopApi["openDefaultWorkspace"]>,
    selectWorkspace: () => bridge.ipcRenderer.invoke("workspace:select") as ReturnType<DesktopApi["selectWorkspace"]>,
    inspectWorkspace: (root) => bridge.ipcRenderer.invoke("workspace:inspect", root) as ReturnType<DesktopApi["inspectWorkspace"]>,
    listRecords: (root, moduleId) => bridge.ipcRenderer.invoke("records:list", root, moduleId) as ReturnType<DesktopApi["listRecords"]>,
    executeCommand: (input) => bridge.ipcRenderer.invoke("records:execute", input) as ReturnType<DesktopApi["executeCommand"]>,
    listModuleViews: (root, moduleId) => bridge.ipcRenderer.invoke("module:views", root, moduleId) as ReturnType<DesktopApi["listModuleViews"]>,
    listHabitRecords: (root, collectionId) => bridge.ipcRenderer.invoke("habits:list", root, collectionId) as ReturnType<DesktopApi["listHabitRecords"]>,
    executeHabitCommand: (input) => bridge.ipcRenderer.invoke("habits:execute", input) as ReturnType<DesktopApi["executeHabitCommand"]>
  };
  bridge.contextBridge.exposeInMainWorld("aimoto", api);
}

/** Electron loads this module directly; tests can still exercise the bridge with a structural fake. */
if (process.versions.electron) {
  const require = createRequire(import.meta.url);
  const electron = require("electron") as ElectronBridge;
  exposeDesktopApi(electron);
}
