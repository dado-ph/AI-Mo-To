import { access, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { validateProtocol } from "@ai-mo-to/protocol";

import { runCli, type CliIo } from "../src/cli.js";

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
        health: "ok"
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
});
