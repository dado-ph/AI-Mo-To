import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { verifyWorkspaceUi, WorkspaceEngine } from "../src/index.js";

const roots: string[] = [];

async function temporaryWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "aimoto-engine-handoff-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("workspace implementation handoff", () => {
  it("creates a blank workspace and returns a direct implementation brief", async () => {
    const root = await temporaryWorkspace();
    const engine = new WorkspaceEngine();

    const workspace = await engine.createWorkspace({
      root,
      name: "Garden",
      now: () => new Date("2026-08-10T00:00:00.000Z")
    });

    expect(workspace).toMatchObject({
      root: resolve(root),
      workspaceId: "garden",
      name: "Garden",
      createdAt: "2026-08-10T00:00:00.000Z",
      revision: 0,
      currentVersionId: null,
      health: "ok"
    });
    expect(workspace).not.toHaveProperty("modules");
    expect((await readdir(root)).sort()).toEqual([".aimoto"]);
    expect((await readdir(join(root, ".aimoto"))).sort()).toEqual([
      "notes.json",
      "state.sqlite",
      "versions",
      "workspace.json"
    ]);
    await expect(access(join(root, "files"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(root, "tasks"))).rejects.toMatchObject({ code: "ENOENT" });

    await writeFile(join(root, ".aimoto", "notes.json"), `${JSON.stringify(["Keep data local-first."])}\n`, "utf8");
    const brief = await engine.prepareImplementationRequest({
      root,
      request: "Build a garden planner",
      maturity: { prototype: true }
    });

    expect(brief).toMatchObject({
      workspaceRoot: resolve(root),
      request: "Build a garden planner"
    });
    expect(brief).not.toHaveProperty("category");
    expect(brief).not.toHaveProperty("modules");
    expect(brief.instructions).toContain("Keep data local-first.");
    expect(brief.instructions).toContain("Build a garden planner");
    expect(brief.instructions).toContain("prototype");
    expect(brief.instructions).toContain("public/index.html");
    expect(brief.instructions).toContain("Treat domain state as durable");
    expect(brief.instructions).toContain("must not merely add it to an in-page list");
    await expect(readFile(join(root, ".aimoto", "implementation-requirements.json"), "utf8")).resolves.toContain('"requiresHostAction": false');
    expect(brief.instructions.endsWith(
      `AI-Mo-To has not built this workspace. You must now implement the workspace in ${resolve(root)}. Continue until the requested UI and functions work.`
    )).toBe(true);
  });

  it("creates, lists, and restores filesystem versions through the engine", async () => {
    const root = await temporaryWorkspace();
    const engine = new WorkspaceEngine();
    await engine.createWorkspace({ root, name: "Garden" });
    await mkdir(join(root, "ui"), { recursive: true });
    await writeFile(join(root, "ui", "index.html"), "<button>Water</button>", "utf8");

    await expect(engine.listWorkspaceVersions(root)).resolves.toEqual([]);
    const captured = await engine.createWorkspaceVersion({ root, message: "Add garden UI" });
    await expect(engine.listWorkspaceVersions(root)).resolves.toEqual([captured]);

    await writeFile(join(root, "ui", "index.html"), "changed", "utf8");
    const restored = await engine.restoreWorkspaceVersion(root, captured.versionId);

    expect(restored.parentVersionId).toBe(captured.versionId);
    await expect(readFile(join(root, "ui", "index.html"), "utf8")).resolves.toBe("<button>Water</button>");
    await expect(engine.inspectWorkspace(root)).resolves.toMatchObject({
      revision: 2,
      currentVersionId: restored.versionId
    });
  });

  it("returns correction-ready diagnostics until an interactive workspace uses Shadcn safely", async () => {
    const root = await temporaryWorkspace();
    await new WorkspaceEngine().createWorkspace({ root, name: "Garden" });
    const broken = await verifyWorkspaceUi(root);
    expect(broken.ok).toBe(false);
    expect(broken.issues.map((issue) => issue.code)).toContain("UI_SHADCN_CONFIG_MISSING");
    expect(broken.issues.map((issue) => issue.code)).toContain("UI_CN_UTILITY_MISSING");

    await mkdir(join(root, "src", "components", "ui"), { recursive: true });
    await mkdir(join(root, "src", "lib"), { recursive: true });
    await writeFile(join(root, "components.json"), JSON.stringify({ tailwind: { cssVariables: true }, aliases: { ui: "@/components/ui", utils: "@/lib/utils" } }));
    await writeFile(join(root, "src", "lib", "utils.ts"), 'import { clsx } from "clsx"; import { twMerge } from "tailwind-merge"; export function cn(...input: unknown[]) { return twMerge(clsx(input)); }');
    await writeFile(join(root, "src", "components", "ui", "button.tsx"), "export const Button = () => null;");
    await writeFile(join(root, "src", "app.tsx"), 'import { Button } from "@/components/ui/button"; import { cn } from "@/lib/utils"; export function App(){ return <Button className={cn("min-h-11", true && "focus-visible:ring-2")} />; }');

    await expect(verifyWorkspaceUi(root)).resolves.toMatchObject({ ok: true, issues: [] });
  });

  it("rejects a browser-only substitute when the implementation request requires a host action", async () => {
    const root = await temporaryWorkspace();
    const engine = new WorkspaceEngine();
    await engine.createWorkspace({ root, name: "Error message" });
    await engine.prepareImplementationRequest({ root, request: "Show a Windows OS error message with a PowerShell script" });
    await writeFile(join(root, "app.js"), "localStorage.setItem('message', 'fake'); dialog.showModal();", "utf8");

    const report = await verifyWorkspaceUi(root);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "HOST_ACTION_DECLARATION_MISSING",
      "HOST_ACTION_BRIDGE_UNUSED",
      "HOST_ACTION_BROWSER_SUBSTITUTE"
    ]));
  });
});
