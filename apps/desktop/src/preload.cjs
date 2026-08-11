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
  getWorkspacePresentation: (root) => ipcRenderer.invoke("workspace:presentation", root),
  openWorkspaceFolder: (root) => ipcRenderer.invoke("workspace:openFolder", root),
  createWorkspace: (name, rootPath) => ipcRenderer.invoke("workspace:create", name, rootPath),
  renameWorkspace: (root, newName) => ipcRenderer.invoke("workspace:rename", root, newName),
  deleteWorkspace: (root) => ipcRenderer.invoke("workspace:delete", root),
  requestImplementation: (root, request) => ipcRenderer.invoke("workspace:request", root, request),
  listWorkspaceVersions: (root) => ipcRenderer.invoke("versions:list", root),
  restoreWorkspaceVersion: (root, versionId) => ipcRenderer.invoke("versions:restore", root, versionId),
  invokeWorkspaceAction: (root, action, input) => ipcRenderer.invoke("workspace:action", root, action, input),
  createTerminal: (root) => ipcRenderer.invoke("terminal:create", root),
  writeTerminal: (sessionId, data) => ipcRenderer.invoke("terminal:write", sessionId, data),
  closeTerminal: (sessionId) => ipcRenderer.invoke("terminal:close", sessionId),
  onTerminalData: (listener) => {
    terminalListeners.push(listener);
    return () => {
      const index = terminalListeners.indexOf(listener);
      if (index >= 0) terminalListeners.splice(index, 1);
    };
  },
  resizeTerminal: (sessionId, cols, rows) => ipcRenderer.invoke("terminal:resize", sessionId, cols, rows)
});
