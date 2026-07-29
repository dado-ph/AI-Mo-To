import type { DesktopApi } from "./contracts.js";

export interface ElectronBridge {
  contextBridge: { exposeInMainWorld(key: string, api: DesktopApi): void };
  ipcRenderer: { invoke(channel: string, ...args: unknown[]): Promise<unknown> };
}

/** Exposes only typed, allow-listed operations; the renderer never receives Node/Electron globals. */
export function exposeDesktopApi(bridge: ElectronBridge): void {
  const api: DesktopApi = {
    selectWorkspace: () => bridge.ipcRenderer.invoke("workspace:select") as ReturnType<DesktopApi["selectWorkspace"]>,
    inspectWorkspace: (root) => bridge.ipcRenderer.invoke("workspace:inspect", root) as ReturnType<DesktopApi["inspectWorkspace"]>
  };
  bridge.contextBridge.exposeInMainWorld("aimoto", api);
}
