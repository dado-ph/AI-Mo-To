import { describe, expect, it, vi } from "vitest";
import { screenFor } from "../src/contracts.js";
import { openDesktopWindow, registerDesktopIpc } from "../src/main.js";
import { exposeDesktopApi } from "../src/preload.js";

describe("desktop shell", () => {
  it("renders Files and Tasks even before a workspace is selected", () => {
    expect(screenFor().views.map((view) => view.id)).toEqual(["files", "tasks"]);
  });

  it("keeps renderer access to two allow-listed IPC calls", () => {
    const expose = vi.fn(); const invoke = vi.fn();
    exposeDesktopApi({ contextBridge: { exposeInMainWorld: expose }, ipcRenderer: { invoke } });
    const api = expose.mock.calls[0]?.[1] as { inspectWorkspace(root: string): Promise<unknown> };
    api.inspectWorkspace("C:/work");
    expect(invoke).toHaveBeenCalledWith("workspace:inspect", "C:/work");
  });

  it("registers workspace selection and inspection in main", () => {
    const handle = vi.fn();
    registerDesktopIpc({ ipcMain: { handle }, dialog: { showOpenDialog: vi.fn() }, BrowserWindow: class { async loadFile() {} } }, { inspectWorkspace: vi.fn() });
    expect(handle.mock.calls.map(([channel]) => channel)).toEqual(["workspace:inspect", "workspace:select"]);
  });

  it("opens an isolated, sandboxed renderer", async () => {
    const loadFile = vi.fn().mockResolvedValue(undefined); const BrowserWindow = vi.fn().mockImplementation(function (this: { loadFile: typeof loadFile }) { this.loadFile = loadFile; });
    await openDesktopWindow({ ipcMain: { handle: vi.fn() }, dialog: { showOpenDialog: vi.fn() }, BrowserWindow }, { preload: "preload.js", renderer: "index.html" });
    expect(BrowserWindow).toHaveBeenCalledWith({ webPreferences: { contextIsolation: true, sandbox: true, preload: "preload.js" } });
    expect(loadFile).toHaveBeenCalledWith("index.html");
  });
});
