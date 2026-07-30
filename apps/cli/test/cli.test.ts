import { access, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { validateProtocol } from "@ai-mo-to/protocol";
import { EngineError } from "@ai-mo-to/engine";

import { desktopExecutableCandidates, runCli, type CliIo } from "../src/cli.js";

const roots: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "aimoto-cli-"));
  roots.push(root);
  return root;
}

function capture(): {
  io: CliIo;
  stdout: string[];
  stderr: string[];
} {
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

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
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

  it("creates and inspects the same workspace through JSON commands", async () => {
    const cwd = await temporaryDirectory();
    const createdOutput = capture();
    const createdExit = await runCli(
      [
        "workspace",
        "create",
        "Neighborhood Clean-up",
        "--root",
        "clean-up",
        "--json"
      ],
      createdOutput.io,
      {
        cwd,
        traceId: () => "d49b2144-17a8-4a1c-8f3e-01e92d6c6e5e"
      }
    );
    const createdEnvelope = JSON.parse(createdOutput.stdout[0] ?? "") as unknown;

    expect(createdExit).toBe(0);
    expect(validateProtocol("json-envelope", createdEnvelope).valid).toBe(true);
    expect(createdEnvelope).toMatchObject({
      ok: true,
      command: "workspace.create",
      data: {
        workspaceId: "neighborhood-clean-up",
        revision: 0,
        health: "ok"
      }
    });

    const inspectedOutput = capture();
    const inspectedExit = await runCli(
      ["inspect", "--workspace", "clean-up", "--json"],
      inspectedOutput.io,
      {
        cwd,
        traceId: () => "32d9999f-3703-48cb-8736-f4546697a21c"
      }
    );

    expect(inspectedExit).toBe(0);
    expect(JSON.parse(inspectedOutput.stdout[0] ?? "")).toMatchObject({
      ok: true,
      command: "inspect",
      data: {
        workspaceId: "neighborhood-clean-up",
        revision: 0,
        health: "ok",
        evidence: {
          revisions: [expect.objectContaining({ revision: 0, reason: "workspace.created" })],
          proposals: [],
          approvals: [],
          recordHealth: { status: "ok", totalRecords: 0, totalEvents: 0, collections: [] }
        }
      }
    });
  });

  it("returns a stable JSON error for a missing workspace", async () => {
    const cwd = await temporaryDirectory();
    const output = capture();
    const exitCode = await runCli(
      ["inspect", "--json"],
      output.io,
      {
        cwd,
        traceId: () => "32d9999f-3703-48cb-8736-f4546697a21c"
      }
    );

    expect(exitCode).toBe(2);
    expect(JSON.parse(output.stdout[0] ?? "")).toMatchObject({
      ok: false,
      command: "inspect",
      error: {
        code: "WorkspaceNotFound"
      }
    });
  });

  it.each([
    ["EACCES", "FilesystemAccessDenied", "filesystem"],
    ["EBUSY", "ResourceBusy", "resource"],
    ["ERR_MODULE_NOT_FOUND", "ResourceNotFound", "resource"],
    ["SQLITE_CANTOPEN", "BootstrapFailed", "bootstrap"],
  ])("normalizes %s without exposing exception data", async (nativeCode, publicCode, category) => {
    const cwd = await temporaryDirectory();
    await runCli(["init", "Failure Boundary", "--root", "boundary", "--json"], capture().io, { cwd });
    const output = capture();
    const sensitivePath = join(cwd, "private", "credential.txt");
    const failure = Object.assign(new Error(`failed at ${sensitivePath} with token=secret`), {
      code: nativeCode,
      path: sensitivePath,
    });

    expect(await runCli(
      ["open", "--workspace", "boundary", "--json"],
      output.io,
      {
        cwd,
        traceId: () => "32d9999f-3703-48cb-8736-f4546697a21c",
        openDesktop: async () => { throw failure; },
      }
    )).toBe(publicCode === "InternalError" ? 1 : 2);
    const serialized = output.stdout[0] ?? "";
    expect(JSON.parse(serialized)).toMatchObject({
      ok: false,
      command: "open",
      traceId: "32d9999f-3703-48cb-8736-f4546697a21c",
      error: {
        code: publicCode,
        details: {
          category,
          retryable: expect.any(Boolean),
          remediation: expect.any(String),
        },
      },
    });
    expect(serialized).not.toContain(sensitivePath);
    expect(serialized).not.toContain("token=secret");
  });

  it("normalizes malformed stored data without echoing parser input", async () => {
    const cwd = await temporaryDirectory();
    await runCli(["init", "Schema Boundary", "--root", "schema", "--json"], capture().io, { cwd });
    const output = capture();
    const failure = new SyntaxError("Unexpected token in secret workspace content");

    expect(await runCli(
      ["open", "--workspace", "schema", "--json"],
      output.io,
      { cwd, openDesktop: async () => { throw failure; } }
    )).toBe(2);
    const serialized = output.stdout[0] ?? "";
    expect(JSON.parse(serialized)).toMatchObject({
      error: { code: "SchemaInvalid", details: { category: "schema" } },
    });
    expect(serialized).not.toContain("secret workspace content");
  });

  it("redacts an internal EngineError while preserving its traceId", async () => {
    const cwd = await temporaryDirectory();
    await runCli(["init", "Internal Boundary", "--root", "internal", "--json"], capture().io, { cwd });
    const output = capture();

    expect(await runCli(
      ["open", "--workspace", "internal", "--json"],
      output.io,
      {
        cwd,
        traceId: () => "32d9999f-3703-48cb-8736-f4546697a21c",
        openDesktop: async () => {
          throw new EngineError("InternalError", "database password=secret", {
            path: "C:\\private\\workspace",
          });
        },
      }
    )).toBe(1);
    const serialized = output.stdout[0] ?? "";
    expect(JSON.parse(serialized)).toMatchObject({
      traceId: "32d9999f-3703-48cb-8736-f4546697a21c",
      error: {
        code: "InternalError",
        message: "The command could not be completed.",
        details: { category: "internal" },
      },
    });
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("private");
  });

  it("stages a visible plan and applies only its exact digest", async () => {
    const cwd = await temporaryDirectory();
    const create = capture();
    await runCli(["workspace", "create", "Proposal Workspace", "--root", "proposal", "--json"], create.io, { cwd });

    const planned = capture();
    expect(await runCli(
      ["plan", "--workspace", "proposal", "--set-authority", "build", "--json"],
      planned.io,
      { cwd, traceId: () => "d49b2144-17a8-4a1c-8f3e-01e92d6c6e5e" }
    )).toBe(0);
    const proposal = JSON.parse(planned.stdout[0] ?? "").data;
    expect(proposal).toMatchObject({ status: "pending", baseRevision: 0 });

    const applied = capture();
    expect(await runCli([
      "apply", "--workspace", "proposal", "--proposal", proposal.proposalId,
      "--hash", proposal.changeSetDigest, "--json"
    ], applied.io, { cwd })).toBe(0);
    expect(JSON.parse(applied.stdout[0] ?? "")).toMatchObject({
      ok: true,
      data: { revision: 1, authorityMode: "build" }
    });
  });

  it("returns a machine-readable error for a nonexistent proposal", async () => {
    const cwd = await temporaryDirectory();
    const create = capture();
    await runCli(["workspace", "create", "Missing Proposal", "--root", "missing", "--json"], create.io, { cwd });
    const output = capture();

    expect(await runCli([
      "apply", "--workspace", "missing", "--proposal", "d49b2144-17a8-4a1c-8f3e-01e92d6c6e5e",
      "--hash", `sha256:${"a".repeat(64)}`, "--json"
    ], output.io, { cwd })).toBe(2);
    expect(JSON.parse(output.stdout[0] ?? "")).toMatchObject({
      ok: false,
      error: { code: "ProposalNotFound" }
    });
  });

  it("prints usage successfully for any command-level help request", async () => {
    const output = capture();
    expect(await runCli(["workspace", "create", "--help"], output.io)).toBe(0);
    expect(output.stdout[0]).toContain("aimoto workspace create");
  });

  it("publishes versioned machine-readable discovery help", async () => {
    const output = capture();
    expect(await runCli(["--help", "--json"], output.io, {
      traceId: () => "32d9999f-3703-48cb-8736-f4546697a21c"
    })).toBe(0);
    expect(JSON.parse(output.stdout[0] ?? "")).toMatchObject({
      envelopeVersion: expect.any(String),
      ok: true,
      command: "help",
      data: {
        usage: expect.stringContaining('aimoto request "<ordinary need>"'),
        approvalRule: expect.stringContaining("exact proposal")
      }
    });
  });

  it("initializes, diagnoses, inspects, and opens a workspace through the agent-facing commands", async () => {
    const cwd = await temporaryDirectory();
    const initialized = capture();
    expect(await runCli(
      ["init", "Clueless User Workspace", "--root", "clueless", "--json"],
      initialized.io,
      { cwd }
    )).toBe(0);
    expect(JSON.parse(initialized.stdout[0] ?? "")).toMatchObject({
      ok: true,
      command: "init",
      data: { workspaceId: "clueless-user-workspace", revision: 0 }
    });

    const doctor = capture();
    expect(await runCli(
      ["doctor", "--workspace", "clueless", "--json"],
      doctor.io,
      { cwd, platform: "win32", nodeVersion: "22.14.0" }
    )).toBe(0);
    expect(JSON.parse(doctor.stdout[0] ?? "")).toMatchObject({
      ok: true,
      command: "doctor",
      data: {
        healthy: true,
        checks: [
          { id: "node", ok: true },
          { id: "platform", ok: true },
          {
            id: "bootstrap",
            ok: true,
            evidence: {
              moduleIds: ["aimoto.files", "aimoto.tasks"],
              cleanup: "disposable probe directory removed"
            }
          },
          { id: "workspace", ok: true }
        ]
      }
    });

    const openedRoots: string[] = [];
    const opened = capture();
    expect(await runCli(
      ["open", "--workspace", "clueless", "--json"],
      opened.io,
      {
        cwd,
        openDesktop: async (root) => {
          openedRoots.push(root);
          return { launched: true, executable: "AI-Mo-To.exe" };
        }
      }
    )).toBe(0);
    expect(openedRoots).toEqual([join(cwd, "clueless")]);
    expect(JSON.parse(opened.stdout[0] ?? "")).toMatchObject({
      ok: true,
      command: "open",
      data: {
        launched: true,
        workspace: { workspaceId: "clueless-user-workspace" }
      }
    });
  });

  it("reports an actionable unhealthy result when disposable workspace bootstrap fails", async () => {
    const output = capture();
    expect(await runCli(
      ["doctor", "--json"],
      output.io,
      {
        platform: "win32",
        nodeVersion: "22.14.0",
        doctorBootstrapProbe: async () => ({
          id: "bootstrap",
          ok: false,
          detail: "ValidationFailed: built-in Tasks module is missing.",
          remediation: "Reinstall AI-Mo-To and run aimoto doctor again.",
          evidence: { missingModuleIds: ["aimoto.tasks"] }
        })
      }
    )).toBe(1);

    expect(JSON.parse(output.stdout[0] ?? "")).toMatchObject({
      ok: true,
      command: "doctor",
      data: {
        healthy: false,
        checks: [
          { id: "node", ok: true },
          { id: "platform", ok: true },
          {
            id: "bootstrap",
            ok: false,
            remediation: expect.stringContaining("Reinstall"),
            evidence: { missingModuleIds: ["aimoto.tasks"] }
          }
        ],
        next: expect.stringContaining("Resolve the failed checks")
      }
    });
  });

  it("keeps unknown commands machine-readable when JSON is requested", async () => {
    const output = capture();
    expect(await runCli(["make-magic", "--json"], output.io)).toBe(2);
    expect(JSON.parse(output.stdout[0] ?? "")).toMatchObject({
      ok: false,
      command: "make-magic",
      error: {
        code: "InvalidInput",
        message: expect.stringContaining("aimoto --help")
      }
    });
    expect(output.stderr).toEqual([]);
  });

  it("creates and inspects a snapshot, then returns a non-destructive restore plan", async () => {
    const cwd = await temporaryDirectory();
    await runCli(["workspace", "create", "Snapshot CLI", "--root", "snapshot", "--json"], capture().io, { cwd });
    const created = capture();
    expect(await runCli(["snapshot", "create", "--workspace", "snapshot", "--json"], created.io, { cwd })).toBe(0);
    const snapshotId = JSON.parse(created.stdout[0] ?? "").data.snapshotId;
    const listed = capture();
    await runCli(["snapshot", "list", "--workspace", "snapshot", "--json"], listed.io, { cwd });
    expect(JSON.parse(listed.stdout[0] ?? "")).toMatchObject({ data: [{ snapshotId, valid: true }] });
    const plan = capture();
    await runCli(["snapshot", "restore-plan", snapshotId, "--workspace", "snapshot", "--json"], plan.io, { cwd });
    expect(JSON.parse(plan.stdout[0] ?? "")).toMatchObject({ data: { kind: "restore-as-new-revision", targetRevision: 1 } });
  });

  it("requires review and exact approval before applying a snapshot restore", async () => {
    const cwd = await temporaryDirectory();
    await runCli(["workspace", "create", "Restore CLI", "--root", "restore", "--json"], capture().io, { cwd });
    const created = capture();
    await runCli(["snapshot", "create", "--workspace", "restore", "--json"], created.io, { cwd });
    const snapshotId = JSON.parse(created.stdout[0] ?? "").data.snapshotId;
    const change = capture();
    await runCli(["plan", "--workspace", "restore", "--set-authority", "build", "--json"], change.io, { cwd });
    const changeProposal = JSON.parse(change.stdout[0] ?? "").data;
    await runCli(["apply", "--workspace", "restore", "--proposal", changeProposal.proposalId, "--hash", changeProposal.changeSetDigest, "--json"], capture().io, { cwd });
    const proposed = capture();
    expect(await runCli(["snapshot", "restore-propose", snapshotId, "--workspace", "restore", "--json"], proposed.io, { cwd })).toBe(0);
    const restore = JSON.parse(proposed.stdout[0] ?? "").data;
    expect(restore).toMatchObject({ status: "pending", baseRevision: 1, changeSet: { operations: [expect.objectContaining({ kind: "workspace.restore-snapshot" })] } });
    const applied = capture();
    expect(await runCli(["apply", "--workspace", "restore", "--proposal", restore.proposalId, "--hash", restore.changeSetDigest, "--json"], applied.io, { cwd })).toBe(0);
    expect(JSON.parse(applied.stdout[0] ?? "")).toMatchObject({ data: { revision: 2, authorityMode: "suggest" } });
  });

  it("takes a plain-language Habit Tracker request through review, exact approval, and installation", async () => {
    const cwd = await temporaryDirectory();
    await runCli(["workspace", "create", "Habit Proof", "--root", "habits", "--json"], capture().io, { cwd });

    const planned = capture();
    expect(await runCli([
      "agent", "habit", "plan", "--workspace", "habits",
      "--request", "I want to track meditation every day", "--json",
    ], planned.io, { cwd })).toBe(0);
    const proposal = JSON.parse(planned.stdout[0] ?? "").data;
    expect(proposal).toMatchObject({
      request: "I want to track meditation every day",
      plan: { displayName: "Habit Tracker" },
      stagedModule: { moduleId: "local.habit-tracker", digest: expect.stringMatching(/^sha256:/) },
      proposal: { status: "pending", baseRevision: 0 },
    });
    expect(proposal.plan.views).toEqual(expect.arrayContaining([{ id: "daily-check-in", kind: "form" }]));

    const rejected = capture();
    expect(await runCli([
      "apply", "--workspace", "habits", "--proposal", proposal.proposal.proposalId,
      "--hash", `sha256:${"0".repeat(64)}`, "--json",
    ], rejected.io, { cwd })).toBe(2);

    const applied = capture();
    expect(await runCli([
      "apply", "--workspace", "habits", "--proposal", proposal.proposal.proposalId,
      "--hash", proposal.proposal.changeSetDigest, "--json",
    ], applied.io, { cwd })).toBe(0);
    const installed = JSON.parse(applied.stdout[0] ?? "");
    expect(installed).toMatchObject({ data: { revision: 1 } });
    expect(installed.data.modules.some((module: { moduleId: string }) => module.moduleId === "local.habit-tracker")).toBe(true);
    expect(installed.data.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        moduleId: "local.habit-tracker",
        version: "0.1.0",
        digest: proposal.stagedModule.digest
      })
    ]));
    expect(installed.data.evidence).toMatchObject({
      revisions: [
        expect.objectContaining({ revision: 0 }),
        expect.objectContaining({ revision: 1, reason: "proposal.committed" })
      ],
      proposals: [expect.objectContaining({
        proposalId: proposal.proposal.proposalId,
        changeSetDigest: proposal.proposal.changeSetDigest,
        status: "committed",
        appliedRevision: 1
      })],
      approvals: [expect.objectContaining({
        proposalId: proposal.proposal.proposalId,
        changeSetDigest: proposal.proposal.changeSetDigest,
        principalId: "local-user"
      })],
      recordHealth: { status: "ok", totalRecords: 0 }
    });
    await access(join(cwd, "habits", ".aimoto", "modules", "local", proposal.stagedModule.digest.slice(7), "module.json"));
  });

  it("renders a human-readable Habit Tracker review", async () => {
    const cwd = await temporaryDirectory();
    await runCli(["workspace", "create", "Human Habit Proof", "--root", "human-habits"], capture().io, { cwd });
    const output = capture();
    expect(await runCli(["agent", "habit", "plan", "--workspace", "human-habits"], output.io, { cwd })).toBe(0);
    expect(output.stdout[0]).toContain("Habit Tracker is ready for your review.");
    expect(output.stdout[0]).toContain("Exact digest:");
    expect(output.stdout[0]).toContain("Approve it with:");
  });

  it("discovers installed Habit views and performs explicit record interactions with stable JSON", async () => {
    const cwd = await temporaryDirectory();
    await runCli(["init", "Habit Records", "--root", "habit-records", "--json"], capture().io, { cwd });
    const planned = capture();
    await runCli([
      "request", "Help me track meditation every day", "--workspace", "habit-records", "--json",
    ], planned.io, { cwd });
    const proposal = JSON.parse(planned.stdout[0] ?? "").data.proposal;
    await runCli([
      "apply", "--workspace", "habit-records", "--proposal", proposal.proposalId,
      "--hash", proposal.changeSetDigest, "--json",
    ], capture().io, { cwd });

    const views = capture();
    expect(await runCli([
      "module", "views", "--module", "local.habit-tracker",
      "--workspace", "habit-records", "--json",
    ], views.io, { cwd })).toBe(0);
    expect(JSON.parse(views.stdout[0] ?? "")).toMatchObject({
      ok: true,
      command: "module.views",
      data: expect.arrayContaining([
        expect.objectContaining({ moduleId: "local.habit-tracker", id: "daily-check-in", collection: "habit-entry" }),
      ]),
    });

    const created = capture();
    expect(await runCli([
      "habit", "create", "--id", "meditation", "--name", "Meditation",
      "--workspace", "habit-records", "--json",
    ], created.io, { cwd })).toBe(0);
    expect(JSON.parse(created.stdout[0] ?? "")).toMatchObject({
      ok: true,
      command: "habit.create",
      data: {
        moduleId: "local.habit-tracker",
        collectionId: "habit",
        recordId: "meditation",
        version: 1,
        data: { habitId: "meditation", name: "Meditation" },
      },
    });

    const logged = capture();
    expect(await runCli([
      "habit", "log", "--habit", "meditation", "--entry", "meditation-2026-07-29",
      "--date", "2026-07-29", "--workspace", "habit-records", "--json",
    ], logged.io, { cwd })).toBe(0);
    expect(JSON.parse(logged.stdout[0] ?? "")).toMatchObject({
      ok: true,
      command: "habit.log",
      data: {
        collectionId: "habit-entry",
        recordId: "meditation-2026-07-29",
        data: { habitId: "meditation", completedOn: "2026-07-29" },
      },
    });

    const listed = capture();
    expect(await runCli([
      "records", "list", "--module", "local.habit-tracker", "--collection", "habit-entry",
      "--workspace", "habit-records", "--json",
    ], listed.io, { cwd })).toBe(0);
    expect(JSON.parse(listed.stdout[0] ?? "")).toMatchObject({
      ok: true,
      command: "records.list",
      data: [expect.objectContaining({ recordId: "meditation-2026-07-29" })],
    });

    const builtIns = capture();
    expect(await runCli([
      "records", "list", "--module", "aimoto.tasks", "--workspace", "habit-records", "--json",
    ], builtIns.io, { cwd })).toBe(0);
    expect(JSON.parse(builtIns.stdout[0] ?? "")).toMatchObject({
      ok: true,
      command: "records.list",
      data: [],
    });
  });

  it("turns an ordinary outcome request into a reviewable proposal without applying it", async () => {
    const cwd = await temporaryDirectory();
    await runCli(["init", "Ordinary Life", "--root", "ordinary", "--json"], capture().io, { cwd });
    const requested = capture();
    expect(await runCli([
      "request", "Help me track meditation every day", "--workspace", "ordinary", "--json",
    ], requested.io, { cwd })).toBe(0);
    const response = JSON.parse(requested.stdout[0] ?? "");
    expect(response).toMatchObject({
      ok: true,
      command: "request",
      data: {
        understoodAs: expect.stringContaining("habits"),
        changesApplied: false,
        approvalRequired: true,
        explanation: expect.stringContaining("Nothing has been installed"),
        plan: { displayName: "Habit Tracker" },
        proposal: { status: "pending", baseRevision: 0 },
        next: { action: "review", commandTemplate: expect.stringContaining("aimoto apply") },
      },
    });
    const inspection = capture();
    await runCli(["inspect", "--workspace", "ordinary", "--json"], inspection.io, { cwd });
    const unchanged = JSON.parse(inspection.stdout[0] ?? "").data;
    expect(unchanged.revision).toBe(0);
    expect(unchanged.modules.some((module: { moduleId: string }) => module.moduleId === "local.habit-tracker")).toBe(false);
  });

  it("honestly rejects unsupported outcomes without changing the workspace", async () => {
    const cwd = await temporaryDirectory();
    await runCli(["init", "Unsupported Need", "--root", "unsupported", "--json"], capture().io, { cwd });
    const requested = capture();
    expect(await runCli([
      "request", "Prepare and file my business taxes", "--workspace", "unsupported", "--json",
    ], requested.io, { cwd })).toBe(2);
    expect(JSON.parse(requested.stdout[0] ?? "")).toMatchObject({
      ok: false,
      command: "request",
      error: {
        code: "InvalidInput",
        message: expect.stringContaining("cannot safely fulfill"),
        details: {
          changesApplied: false,
          supportedOutcomes: [expect.stringContaining("habits")],
        },
      },
    });
    const inspection = capture();
    await runCli(["inspect", "--workspace", "unsupported", "--json"], inspection.io, { cwd });
    const unchanged = JSON.parse(inspection.stdout[0] ?? "").data;
    expect(unchanged.revision).toBe(0);
    expect(unchanged.modules.some((module: { moduleId: string }) => module.moduleId === "local.habit-tracker")).toBe(false);
  });
});
