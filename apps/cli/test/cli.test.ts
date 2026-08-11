import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { validateProtocol } from "@ai-mo-to/protocol";

import { desktopExecutableCandidates, runCli, type CliIo } from "../src/cli.js";

const roots: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "aimoto-cli-"));
  roots.push(root);
  return root;
}

function capture(): { io: CliIo; stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message)
    }
  };
}

function json(output: ReturnType<typeof capture>): Record<string, any> {
  return JSON.parse(output.stdout[0] ?? "") as Record<string, any>;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("aimoto CLI", () => {
  it("prefers the packaged host when the installer used a custom directory", () => {
    expect(desktopExecutableCandidates(
      { AIMOTO_DESKTOP_PATH: "C:\\override\\AI-Mo-To.exe", LOCALAPPDATA: "C:\\Users\\Ada\\AppData\\Local" },
      "D:\\Chosen Folder\\AI-Mo-To.exe"
    )).toEqual([
      "D:\\Chosen Folder\\AI-Mo-To.exe",
      "C:\\override\\AI-Mo-To.exe",
      "C:\\Users\\Ada\\AppData\\Local\\Programs\\AI-Mo-To\\AI-Mo-To.exe"
    ]);
  });

  it("creates and inspects a module-free workspace through JSON commands", async () => {
    const cwd = await temporaryDirectory();
    const created = capture();
    expect(await runCli(["workspace", "create", "Garden", "--root", "garden", "--json"], created.io, { cwd })).toBe(0);
    expect(validateProtocol("json-envelope", json(created)).valid).toBe(true);
    expect(json(created)).toMatchObject({
      ok: true,
      command: "workspace.create",
      data: { workspaceId: "garden", revision: 0, currentVersionId: null, health: "ok" }
    });
    expect(json(created).data).not.toHaveProperty("modules");

    const inspected = capture();
    expect(await runCli(["inspect", "--workspace", "garden", "--json"], inspected.io, { cwd })).toBe(0);
    expect(json(inspected)).toMatchObject({
      ok: true,
      command: "inspect",
      data: { workspaceId: "garden", revision: 0, currentVersionId: null, health: "ok" }
    });
  });

  it("returns a direct implementation brief without creating a proposal", async () => {
    const cwd = await temporaryDirectory();
    const localAppData = join(cwd, "local-app-data");
    const workspaceRoot = join(localAppData, "AI-Mo-To", "workspaces", "garden");
    const output = capture();

    expect(await runCli(["request", "Build a garden planner", "--workspace", workspaceRoot, "--json"], output.io, {
      cwd,
      environment: { LOCALAPPDATA: localAppData }
    })).toBe(0);
    expect(json(output)).toMatchObject({
      ok: true,
      command: "request",
      data: {
        implementationBrief: {
          workspaceRoot,
          workspaceId: "garden",
          request: "Build a garden planner",
          instructions: expect.stringContaining("must now implement the workspace")
        }
      }
    });
    expect(json(output).data).not.toHaveProperty("proposal");
    expect(json(output).data).not.toHaveProperty("category");
    expect(json(output).data).not.toHaveProperty("stagedModule");
    expect(json(output).data.implementationBrief.instructions).toContain("aimoto verify");
  });

  it("makes UI quality failures machine-readable and correction-ready", async () => {
    const cwd = await temporaryDirectory();
    await runCli(["workspace", "create", "Garden", "--root", "garden", "--json"], capture().io, { cwd });
    const output = capture();
    expect(await runCli(["verify", "--workspace", "garden", "--json"], output.io, { cwd })).toBe(1);
    expect(json(output)).toMatchObject({
      ok: true,
      command: "verify",
      data: { ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "UI_SHADCN_CONFIG_MISSING", remediation: expect.any(String) })]) }
    });
  });

  it("rejects a request path outside the canonical AppData workspace store and gives the agent the correction", async () => {
    const cwd = await temporaryDirectory();
    const localAppData = join(cwd, "local-app-data");
    const homeWorkspace = join(cwd, "ui-callback-laboratory");
    const output = capture();

    expect(await runCli(["request", "Build a callback laboratory", "--workspace", homeWorkspace, "--json"], output.io, {
      cwd,
      environment: { LOCALAPPDATA: localAppData }
    })).toBe(2);
    expect(json(output)).toMatchObject({
      ok: false,
      command: "request",
      error: {
        code: "InvalidInput",
        message: expect.stringContaining(`Remove --workspace and run the request again; AI-Mo-To will use \"${join(localAppData, "AI-Mo-To", "workspaces", "default")}\"`)
      }
    });
  });

  it("rejects the removed request --agent path", async () => {
    const cwd = await temporaryDirectory();
    const output = capture();

    expect(await runCli(["request", "Build a garden planner", "--workspace", "garden", "--agent", "--json"], output.io, { cwd })).toBe(2);
    expect(json(output)).toMatchObject({
      ok: false,
      command: "request",
      error: { code: "InvalidInput", message: expect.stringContaining("--agent") }
    });
  });

  it("creates no version until version create is explicitly run", async () => {
    const cwd = await temporaryDirectory();
    const localAppData = join(cwd, "local-app-data");
    const workspaceRoot = join(localAppData, "AI-Mo-To", "workspaces", "garden");
    await runCli(["request", "Build a garden planner", "--workspace", workspaceRoot, "--json"], capture().io, {
      cwd,
      environment: { LOCALAPPDATA: localAppData }
    });
    const listed = capture();

    expect(await runCli(["version", "list", "--workspace", workspaceRoot, "--json"], listed.io, {
      cwd,
      environment: { LOCALAPPDATA: localAppData }
    })).toBe(0);
    expect(json(listed)).toMatchObject({ ok: true, command: "version.list", data: { versions: [] } });
  });

  it("creates a version only with a user-approved summary", async () => {
    const cwd = await temporaryDirectory();
    await runCli(["workspace", "create", "Garden", "--root", "garden", "--json"], capture().io, { cwd });
    await writeFile(join(cwd, "garden", "index.html"), "<button>Water</button>");
    const missingMessage = capture();
    expect(await runCli(["version", "create", "--workspace", "garden", "--json"], missingMessage.io, { cwd })).toBe(2);
    expect(json(missingMessage)).toMatchObject({
      ok: false,
      command: "version.create",
      error: { code: "InvalidInput", message: expect.stringContaining("--message") }
    });

    const created = capture();
    expect(await runCli([
      "version", "create", "--workspace", "garden", "--message", "Add garden UI", "--json"
    ], created.io, { cwd })).toBe(0);
    expect(json(created)).toMatchObject({
      ok: true,
      command: "version.create",
      data: {
        explicitUserConfirmationRequired: true,
        version: { message: "Add garden UI", revision: 1, parentVersionId: null }
      }
    });

    const listed = capture();
    await runCli(["version", "list", "--workspace", "garden", "--json"], listed.io, { cwd });
    expect(json(listed).data.versions).toEqual([
      expect.objectContaining({ versionId: json(created).data.version.versionId, message: "Add garden UI" })
    ]);
  });

  it("restores a selected capture as a new version", async () => {
    const cwd = await temporaryDirectory();
    const workspaceRoot = join(cwd, "garden");
    await runCli(["workspace", "create", "Garden", "--root", "garden", "--json"], capture().io, { cwd });
    await writeFile(join(workspaceRoot, "index.html"), "original");
    const created = capture();
    await runCli(["version", "create", "--workspace", "garden", "--message", "Original", "--json"], created.io, { cwd });
    const versionId = json(created).data.version.versionId as string;
    await writeFile(join(workspaceRoot, "index.html"), "changed");
    const restored = capture();

    expect(await runCli(["version", "restore", versionId, "--workspace", "garden", "--json"], restored.io, { cwd })).toBe(0);
    expect(json(restored)).toMatchObject({
      ok: true,
      command: "version.restore",
      data: { version: { revision: 2, parentVersionId: versionId } }
    });
    await expect(readFile(join(workspaceRoot, "index.html"), "utf8")).resolves.toBe("original");
  });

  it("publishes the request and explicit version commands in machine-readable help", async () => {
    const output = capture();
    expect(await runCli(["--help", "--json"], output.io)).toBe(0);
    expect(json(output).data.usage).toContain("aimoto request");
    expect(json(output).data.usage).toContain("aimoto version create");
    expect(json(output).data.usage).toContain("explicit user confirmation");
    expect(json(output).data.usage).not.toContain("--agent");
  });

  it("returns a stable JSON error for a missing workspace", async () => {
    const cwd = await temporaryDirectory();
    const output = capture();
    expect(await runCli(["inspect", "--json"], output.io, { cwd, environment: { LOCALAPPDATA: join(cwd, "local-app-data") } })).toBe(2);
    expect(json(output)).toMatchObject({ ok: false, command: "inspect", error: { code: "WorkspaceNotFound" } });
    expect(output.stderr).toEqual([]);
  });

  it("keeps unknown commands machine-readable when JSON is requested", async () => {
    const output = capture();
    expect(await runCli(["make-magic", "--json"], output.io)).toBe(2);
    expect(json(output)).toMatchObject({
      ok: false,
      command: "make-magic",
      error: { code: "InvalidInput", message: expect.stringContaining("aimoto --help") }
    });
    expect(output.stderr).toEqual([]);
  });
});
