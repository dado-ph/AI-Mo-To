import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceEngine } from "@ai-mo-to/engine";
import {
  createDesktopApi,
  defaultWorkspaceRoot,
  openDesktopWindow,
  openOrCreateDefaultWorkspace,
  registerDesktopIpc,
  workspaceRootFromArgs
} from "../src/main.js";
import { exposeDesktopApi } from "../src/preload.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("desktop shell", () => {
  it("creates a blank workspace and exposes its versions", async () => {
    const parent = await mkdtemp(join(tmpdir(), "aimoto-desktop-"));
    temporaryRoots.push(parent);
    const root = join(parent, "garden");
    const api = createDesktopApi(new WorkspaceEngine());

    const created = await api.createWorkspace("Garden", root);

    expect(created).not.toHaveProperty("modules");
    expect(created).toMatchObject({ root, name: "Garden", revision: 0, currentVersionId: null });
    await expect(api.listWorkspaceVersions(root)).resolves.toEqual([]);
  });

  it("returns the implementation brief without proposal fields", async () => {
    const parent = await mkdtemp(join(tmpdir(), "aimoto-desktop-"));
    temporaryRoots.push(parent);
    const root = join(parent, "garden");
    const api = createDesktopApi(new WorkspaceEngine());
    await api.createWorkspace("Garden", root);

    const brief = await api.requestImplementation(root, "Build a garden planner");

    expect(brief).toMatchObject({ workspaceRoot: root, request: "Build a garden planner" });
    expect(brief.instructions).toContain("must now implement the workspace");
    expect(brief).not.toHaveProperty("proposal");
  });

  it("keeps renderer access to allow-listed implementation and version IPC calls", () => {
    const expose = vi.fn();
    const invoke = vi.fn();
    exposeDesktopApi({ contextBridge: { exposeInMainWorld: expose }, ipcRenderer: { invoke } });
    const api = expose.mock.calls[0]?.[1] as {
      requestImplementation(root: string, request: string): Promise<unknown>;
      listWorkspaceVersions(root: string): Promise<unknown>;
      restoreWorkspaceVersion(root: string, versionId: string): Promise<unknown>;
    };

    void api.requestImplementation("C:/work", "Build a garden planner");
    void api.listWorkspaceVersions("C:/work");
    void api.restoreWorkspaceVersion("C:/work", "v1");

    expect(invoke).toHaveBeenCalledWith("workspace:request", "C:/work", "Build a garden planner");
    expect(invoke).toHaveBeenCalledWith("versions:list", "C:/work");
    expect(invoke).toHaveBeenCalledWith("versions:restore", "C:/work", "v1");
    expect(Object.keys(expose.mock.calls[0]?.[1] as object)).not.toEqual(
      expect.arrayContaining(["listRecords", "executeCommand", "listModuleViews", "applyProposal"])
    );
  });

  it("ships the same version-oriented CommonJS preload bridge used by packaged Electron", async () => {
    const preload = await readFile(fileURLToPath(new URL("../src/preload.cjs", import.meta.url)), "utf8");
    expect(preload).toContain('require("electron")');
    expect(preload).toContain('contextBridge.exposeInMainWorld("aimoto"');
    expect(preload).toContain("requestImplementation");
    expect(preload).toContain("listWorkspaceVersions");
    expect(preload).toContain("restoreWorkspaceVersion");
    expect(preload).not.toContain("records:");
    expect(preload).not.toContain("module:views");
    expect(preload).not.toContain("workspace:apply");
  });

  it("does not package built-in module resources", async () => {
    const packageJson = JSON.parse(await readFile(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")) as {
      build: { extraResources?: Array<{ from?: string }> };
    };
    expect(packageJson.build.extraResources ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ from: "resources/modules" })])
    );
  });

  it("uses one deterministic product-owned default workspace", async () => {
    const root = defaultWorkspaceRoot("C:/Users/Keno/AppData/Roaming/AI-Mo-To");
    expect(root).toMatch(/workspaces[\\/]default$/);
    const inspectWorkspace = vi.fn().mockRejectedValueOnce({ code: "WorkspaceNotFound" });
    const createWorkspace = vi.fn().mockResolvedValue({ root, workspaceId: "default", name: "My AI-Mo-To Workspace" });
    await expect(openOrCreateDefaultWorkspace({ inspectWorkspace, createWorkspace }, "C:/Users/Keno/AppData/Roaming/AI-Mo-To")).resolves.toMatchObject({ workspaceId: "default" });
    expect(createWorkspace).toHaveBeenCalledWith({ root, name: "My AI-Mo-To Workspace", workspaceId: "default" });
  });

  it("accepts an explicit workspace from the CLI launch contract", () => {
    expect(workspaceRootFromArgs(["AI-Mo-To.exe", "--workspace", "C:/work/my-space"])).toBe("C:/work/my-space");
    expect(workspaceRootFromArgs(["AI-Mo-To.exe"])).toBeUndefined();
    expect(() => workspaceRootFromArgs(["AI-Mo-To.exe", "--workspace"])).toThrow("--workspace requires");
  });

  it("registers only workspace, implementation, version, and terminal routes", () => {
    const handle = vi.fn();
    registerDesktopIpc(
      { ipcMain: { handle }, dialog: { showOpenDialog: vi.fn() }, BrowserWindow: class { async loadFile() {} } },
      new WorkspaceEngine(),
      { root: "C:/default" } as never
    );

    expect(handle.mock.calls.map(([channel]) => channel)).toEqual([
      "workspace:default", "workspace:inspect", "workspace:listAll", "workspace:openFolder", "workspace:create", "workspace:rename", "workspace:delete",
      "workspace:select", "workspace:request", "versions:list", "versions:restore", "terminal:create", "terminal:write", "terminal:resize"
    ]);
  });

  it("opens an isolated, sandboxed renderer", async () => {
    const loadFile = vi.fn().mockResolvedValue(undefined);
    const BrowserWindow = vi.fn().mockImplementation(function (this: { loadFile: typeof loadFile }) { this.loadFile = loadFile; });
    await openDesktopWindow(
      { ipcMain: { handle: vi.fn() }, dialog: { showOpenDialog: vi.fn() }, BrowserWindow },
      { preload: "preload.js", renderer: "index.html" }
    );
    expect(BrowserWindow).toHaveBeenCalledWith({ webPreferences: { contextIsolation: true, sandbox: true, preload: "preload.js" } });
    expect(loadFile).toHaveBeenCalledWith("index.html");
  });
});
