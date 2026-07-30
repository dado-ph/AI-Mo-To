const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aimoto", {
  openDefaultWorkspace: () => ipcRenderer.invoke("workspace:default"),
  selectWorkspace: () => ipcRenderer.invoke("workspace:select"),
  inspectWorkspace: (root) => ipcRenderer.invoke("workspace:inspect", root),
  listRecords: (root, moduleId) => ipcRenderer.invoke("records:list", root, moduleId),
  executeCommand: (input) => ipcRenderer.invoke("records:execute", input),
  listModuleViews: (root, moduleId) => ipcRenderer.invoke("module:views", root, moduleId),
  listHabitRecords: (root, collectionId) => ipcRenderer.invoke("habits:list", root, collectionId),
  executeHabitCommand: (input) => ipcRenderer.invoke("habits:execute", input)
});
