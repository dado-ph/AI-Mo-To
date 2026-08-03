const { contextBridge, ipcRenderer } = require("electron");

const terminalListeners = [];
ipcRenderer.on("terminal:data", (_event, data) => {
  for (const listener of terminalListeners) listener(data);
});

contextBridge.exposeInMainWorld("aimoto", {
  openDefaultWorkspace: () => ipcRenderer.invoke("workspace:default"),
  selectWorkspace: () => ipcRenderer.invoke("workspace:select"),
  inspectWorkspace: (root) => ipcRenderer.invoke("workspace:inspect", root),
  listRecords: (root, moduleId, collectionId) => ipcRenderer.invoke("records:list", root, moduleId, collectionId),
  executeCommand: (input) => ipcRenderer.invoke("records:execute", input),
  listModuleViews: (root, moduleId) => ipcRenderer.invoke("module:views", root, moduleId),
  requestOutcome: (root, request) => ipcRenderer.invoke("workspace:request", root, request),
  applyProposal: (root, proposalId, digest) => ipcRenderer.invoke("workspace:apply", root, proposalId, digest),
  createTerminal: (root) => ipcRenderer.invoke("terminal:create", root),
  writeTerminal: (sessionId, data) => ipcRenderer.invoke("terminal:write", sessionId, data),
  onTerminalData: (listener) => { terminalListeners.push(listener); },
  resizeTerminal: (sessionId, cols, rows) => ipcRenderer.invoke("terminal:resize", sessionId, cols, rows)
});
