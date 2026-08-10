const { contextBridge, ipcRenderer } = require("electron");

const terminalListeners = [];
ipcRenderer.on("terminal:data", (_event, data) => {
  for (const listener of terminalListeners) listener(data);
});

contextBridge.exposeInMainWorld("aimoto", {
  openDefaultWorkspace: () => ipcRenderer.invoke("workspace:default"),
  selectWorkspace: () => ipcRenderer.invoke("workspace:select"),
  inspectWorkspace: (root) => ipcRenderer.invoke("workspace:inspect", root),
  listAllWorkspaces: () => ipcRenderer.invoke("workspace:listAll"),
  openWorkspaceFolder: (root) => ipcRenderer.invoke("workspace:openFolder", root),
  createWorkspace: (name, rootPath) => ipcRenderer.invoke("workspace:create", name, rootPath),
  renameWorkspace: (root, newName) => ipcRenderer.invoke("workspace:rename", root, newName),
  deleteWorkspace: (root) => ipcRenderer.invoke("workspace:delete", root),
  requestImplementation: (root, request) => ipcRenderer.invoke("workspace:request", root, request),
  listWorkspaceVersions: (root) => ipcRenderer.invoke("versions:list", root),
  restoreWorkspaceVersion: (root, versionId) => ipcRenderer.invoke("versions:restore", root, versionId),
  createTerminal: (root) => ipcRenderer.invoke("terminal:create", root),
  writeTerminal: (sessionId, data) => ipcRenderer.invoke("terminal:write", sessionId, data),
  onTerminalData: (listener) => { terminalListeners.push(listener); },
  resizeTerminal: (sessionId, cols, rows) => ipcRenderer.invoke("terminal:resize", sessionId, cols, rows)
});
