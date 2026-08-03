import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceEngine } from "@ai-mo-to/engine";
import { screenFor } from "../src/contracts.js";
import { configurePackagedResources, defaultWorkspaceRoot, exitElectronCli, openDesktopWindow, openOrCreateDefaultWorkspace, registerDesktopIpc, workspaceRootFromArgs } from "../src/main.js";
import { exposeDesktopApi } from "../src/preload.js";

describe("desktop shell", () => {
  it("renders Files and Tasks even before a workspace is selected", () => {
    expect(screenFor().views.map((view) => view.id)).toEqual(["files", "tasks"]);
    expect(screenFor().views[1]?.actions?.[0]?.label).toBe("Try an example");
  });

  it("makes workspace authority explicit in human language", () => {
    expect(screenFor({ authorityMode: "suggest" } as never).authority).toEqual({ label: "Suggest changes", tone: "positive" });
  });

  it("keeps renderer access to allow-listed workspace and record IPC calls", () => {
    const expose = vi.fn(); const invoke = vi.fn();
    exposeDesktopApi({ contextBridge: { exposeInMainWorld: expose }, ipcRenderer: { invoke } });
    const api = expose.mock.calls[0]?.[1] as { inspectWorkspace(root: string): Promise<unknown> };
    (api as typeof api & { openDefaultWorkspace(): Promise<unknown> }).openDefaultWorkspace();
    api.inspectWorkspace("C:/work");
    (api as never as { listRecords(root: string, moduleId: string): Promise<unknown> }).listRecords("C:/work", "aimoto.tasks");
    (api as never as { executeCommand(input: object): Promise<unknown> }).executeCommand({ root: "C:/work", moduleId: "aimoto.tasks", command: "create", input: {} });
    expect(invoke).toHaveBeenCalledWith("workspace:default");
    expect(invoke).toHaveBeenCalledWith("workspace:inspect", "C:/work");
    expect(invoke).toHaveBeenCalledWith("records:list", "C:/work", "aimoto.tasks");
    expect(invoke).toHaveBeenCalledWith("records:execute", { root: "C:/work", moduleId: "aimoto.tasks", command: "create", input: {} });
  });

  it("ships a CommonJS preload bridge for Electron's sandbox", async () => {
    const preload = await readFile(
      fileURLToPath(new URL("../src/preload.cjs", import.meta.url)),
      "utf8"
    );
    expect(preload).toContain('require("electron")');
    expect(preload).toContain('contextBridge.exposeInMainWorld("aimoto"');
    expect(preload).toContain("createTerminal");
  });

  it("packages the renderer stylesheet beside renderer.html", async () => {
    const html = await readFile(fileURLToPath(new URL("../src/renderer.html", import.meta.url)), "utf8");
    const copyScript = await readFile(fileURLToPath(new URL("../scripts/copy-assets.mjs", import.meta.url)), "utf8");
    expect(html).toContain('href="./tokens.css"');
    expect(copyScript).toContain('const tokensDestination = resolve(appRoot, "dist", "tokens.css")');
    expect(copyScript).toContain("await cp(tokensSource, tokensDestination)");
  });

  it("uses one deterministic product-owned default workspace", async () => {
    const root = defaultWorkspaceRoot("C:/Users/Keno/AppData/Roaming/AI-Mo-To");
    expect(root).toMatch(/workspaces[\\/]default$/);
    const inspectWorkspace = vi.fn().mockRejectedValueOnce({ code: "WorkspaceNotFound" });
    const createWorkspace = vi.fn().mockResolvedValue({ root, workspaceId: "default", name: "My AI-Mo-To Workspace" });
    await expect(openOrCreateDefaultWorkspace({ inspectWorkspace, createWorkspace }, "C:/Users/Keno/AppData/Roaming/AI-Mo-To")).resolves.toMatchObject({ workspaceId: "default" });
    await openOrCreateDefaultWorkspace({ inspectWorkspace: vi.fn().mockResolvedValue({ root, workspaceId: "default" }), createWorkspace }, "C:/Users/Keno/AppData/Roaming/AI-Mo-To");
    expect(createWorkspace).toHaveBeenCalledTimes(1);
    expect(createWorkspace).toHaveBeenCalledWith({ root, name: "My AI-Mo-To Workspace", workspaceId: "default" });
  });

  it("accepts an explicit workspace from the CLI launch contract", () => {
    expect(workspaceRootFromArgs(["AI-Mo-To.exe", "--workspace", "C:/work/my-space"])).toBe("C:/work/my-space");
    expect(workspaceRootFromArgs(["AI-Mo-To.exe"])).toBeUndefined();
    expect(() => workspaceRootFromArgs(["AI-Mo-To.exe", "--workspace"])).toThrow("--workspace requires");
  });

  it("creates a workspace from packaged resources without relying on the repository cwd", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "aimoto-packaged-"));
    const resourcesPath = join(temporaryRoot, "resources");
    const workspaceRoot = join(temporaryRoot, "workspace");
    const unrelatedCwd = join(temporaryRoot, "unrelated");
    const originalCwd = process.cwd();
    const originalModulesDir = process.env.AIMOTO_BUILTIN_MODULES_DIR;

    try {
      await cp(fileURLToPath(new URL("../../../modules", import.meta.url)), join(resourcesPath, "modules"), { recursive: true });
      await cp(resourcesPath, unrelatedCwd, { recursive: true });
      configurePackagedResources(true, resourcesPath);
      process.chdir(unrelatedCwd);

      const created = await new WorkspaceEngine().createWorkspace({
        root: workspaceRoot,
        name: "Packaged Workspace"
      });

      expect(created.modules.map((module) => module.moduleId)).toEqual(["aimoto.files", "aimoto.tasks"]);
      expect(created.health).toBe("ok");
    } finally {
      process.chdir(originalCwd);
      if (originalModulesDir === undefined) delete process.env.AIMOTO_BUILTIN_MODULES_DIR;
      else process.env.AIMOTO_BUILTIN_MODULES_DIR = originalModulesDir;
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("installs a synchronous launcher with a detached open boundary", async () => {
    const installerInclude = await readFile(
      fileURLToPath(new URL("../build/installer.nsh", import.meta.url)),
      "utf8"
    );
    const launcher = await readFile(
      fileURLToPath(new URL("../build/aimoto-launcher.ps1", import.meta.url)),
      "utf8"
    );
    expect(installerInclude).toContain("Microsoft\\WindowsApps\\aimoto.cmd");
    expect(installerInclude).toContain('powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\\aimoto-launcher.ps1" %*');
    expect(launcher).toContain('& $executable --cli @CliArguments');
    expect(launcher.match(/^\s*\$startInfo\.UseShellExecute\s*=\s*\$(?:true|false)\s*$/gim)).toEqual([
      "  $startInfo.UseShellExecute = $true"
    ]);
    expect(launcher).toContain("$canonicalWorkspace.Contains");
    expect(launcher).toContain("$quotedWorkspace = $canonicalWorkspace -replace");
    expect(launcher).toContain("$startInfo.Arguments = '--workspace \"'");
    expect(launcher).toContain("[System.Diagnostics.Process]::Start($startInfo)");
    expect(launcher).toContain("2> $inspectionErrorFile.FullName");
    expect(installerInclude).toContain('WriteRegStr HKCU "Software\\AI-Mo-To" "InstallPath" "$INSTDIR"');
    expect(installerInclude).toContain('Delete "$LOCALAPPDATA\\Microsoft\\WindowsApps\\aimoto.cmd"');
    expect(installerInclude).toContain('DeleteRegValue HKCU "Software\\AI-Mo-To" "InstallPath"');
  });

  it("flushes redirected CLI output and terminates its Electron host promptly", async () => {
    const writes: string[] = [];
    const exit = vi.fn((code?: number): never => {
      throw Object.assign(new Error("process exited"), { code });
    });
    const stream = {
      write(chunk: string, callback?: (error?: Error | null) => void): boolean {
        writes.push(chunk);
        callback?.();
        return true;
      }
    };

    await expect(Promise.race([
      exitElectronCli(0, { stdout: stream, stderr: stream, exit }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("CLI exit timed out")), 500))
    ])).rejects.toMatchObject({ message: "process exited", code: 0 });
    expect(writes).toEqual(["", ""]);
    expect(exit).toHaveBeenCalledOnce();
  });

  it("registers and cleanly removes the product-owned Codex skill", async () => {
    const installerInclude = await readFile(
      fileURLToPath(new URL("../build/installer.nsh", import.meta.url)),
      "utf8"
    );
    const skill = await readFile(
      fileURLToPath(new URL("../agent-skills/aimoto-operate/SKILL.md", import.meta.url)),
      "utf8"
    );
    expect(installerInclude).toContain('ReadEnvStr $1 "CODEX_HOME"');
    expect(installerInclude).toContain('$PROFILE\\.codex');
    expect(installerInclude).toContain('IfFileExists "$2\\.installed-by-ai-mo-to"');
    expect(installerInclude).toContain('CopyFiles /SILENT "$INSTDIR\\resources\\agent-skills\\aimoto-operate\\SKILL.md"');
    expect(installerInclude).toContain('WriteRegStr HKCU "Software\\AI-Mo-To" "CodexSkillPath" "$2"');
    expect(installerInclude).toContain('ReadRegStr $2 HKCU "Software\\AI-Mo-To" "CodexSkillPath"');
    expect(installerInclude).toContain('Delete "$2\\SKILL.md"');
    expect(skill).toContain("even when the user does not name AI-Mo-To");
    expect(skill).toContain("The initial outcome request is not");
    expect(skill).toContain("Do not run `aimoto apply`");
    expect(skill).toContain("`aimoto inspect --json`");
    expect(skill).toContain("Some agent tool subprocesses receive a reduced `PATH`");
    expect(skill).toContain("Microsoft\\WindowsApps\\aimoto.cmd");
    expect(skill).toContain("HKCU:\\Software\\AI-Mo-To");
    expect(skill).toContain('spawn(executable, ["--cli", "--help", "--json"], { shell: false })');
    expect(skill).toContain("That is a tool-runtime failure, not evidence");
    expect(skill).toContain("Node's filesystem API to re-read the installed");
    expect(skill).toContain('["query", "HKCU\\\\Software\\\\AI-Mo-To", "/v", "InstallPath"]');
    expect(skill).toContain('execFile(executable, ["--cli", "--help", "--json"], { shell: false }, callback)');
    expect(skill).toContain("product's installation status unknown");
    expect(skill).toContain("Do not construct a command string containing the user's request");
  });

  it("registers default, workspace selection, and inspection in main", () => {
    const handle = vi.fn();
    registerDesktopIpc(
      { ipcMain: { handle }, dialog: { showOpenDialog: vi.fn() }, BrowserWindow: class { async loadFile() {} } },
      {
        inspectWorkspace: vi.fn(), listBuiltInRecords: vi.fn(), executeBuiltInCommand: vi.fn(),
        listInstalledModuleViews: vi.fn(), listHabitTrackerRecords: vi.fn(), executeHabitTrackerCommand: vi.fn()
      } as never,
      { root: "C:/default" } as never
    );
    expect(handle.mock.calls.map(([channel]) => channel)).toEqual([
      "workspace:default", "workspace:inspect", "workspace:select", "workspace:request", "workspace:apply", "records:list", "records:execute",
      "module:views", "terminal:create", "terminal:write", "terminal:resize"
    ]);
  });

  it("opens an isolated, sandboxed renderer", async () => {
    const loadFile = vi.fn().mockResolvedValue(undefined); const BrowserWindow = vi.fn().mockImplementation(function (this: { loadFile: typeof loadFile }) { this.loadFile = loadFile; });
    await openDesktopWindow({ ipcMain: { handle: vi.fn() }, dialog: { showOpenDialog: vi.fn() }, BrowserWindow }, { preload: "preload.js", renderer: "index.html" });
    expect(BrowserWindow).toHaveBeenCalledWith({ webPreferences: { contextIsolation: true, sandbox: true, preload: "preload.js" } });
    expect(loadFile).toHaveBeenCalledWith("index.html");
  });
});
