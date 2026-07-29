import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import {
  workspaceDatabasePath,
  workspaceManifestPath
} from "@ai-mo-to/storage";

import { EngineError, WorkspaceEngine } from "../src/index.js";
import { type ChangeSet } from "@ai-mo-to/protocol";
import {
  digestBundle,
  proposalToModuleInstallChangeSet,
  type FoundryProposal
} from "@ai-mo-to/foundry";

const roots: string[] = [];

async function temporaryWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "aimoto-engine-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("WorkspaceEngine", () => {
  it("creates and inspects a durable workspace", async () => {
    const root = await temporaryWorkspace();
    const engine = new WorkspaceEngine();
    const created = await engine.createWorkspace({
      root,
      name: "Neighborhood Clean-up",
      now: () => new Date("2026-07-29T00:00:00.000Z")
    });

    expect(created).toMatchObject({
      workspaceId: "neighborhood-clean-up",
      name: "Neighborhood Clean-up",
      revision: 0,
      authorityMode: "suggest",
      health: "ok"
    });
    expect(created.modules).toHaveLength(2);
    expect(created.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({ moduleId: "aimoto.files", source: { kind: "builtin", reference: "builtin:files" }, digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) }),
      expect.objectContaining({ moduleId: "aimoto.tasks", source: { kind: "builtin", reference: "builtin:tasks" }, digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) })
    ]));
    expect(created.layout).toEqual({
      homeView: "tasks.list",
      views: expect.arrayContaining([
        expect.objectContaining({ id: "files.browser" }),
        expect.objectContaining({ id: "tasks.list" })
      ])
    });
    expect(await readFile(workspaceManifestPath(root), "utf8")).toContain(
      '"schemaVersion": "1.0.0"'
    );
    await expect(readFile(workspaceDatabasePath(root))).resolves.not.toHaveLength(0);
    await expect(engine.inspectWorkspace(root)).resolves.toEqual(created);
  });

  it("refuses to replace an existing workspace", async () => {
    const root = await temporaryWorkspace();
    const engine = new WorkspaceEngine();
    await engine.createWorkspace({ root, name: "Existing Workspace" });

    await expect(
      engine.createWorkspace({ root, name: "Replacement" })
    ).rejects.toMatchObject({
      code: "InvalidInput"
    });
  });

  it("reports a missing workspace with a stable error code", async () => {
    const root = await temporaryWorkspace();
    await expect(
      new WorkspaceEngine().inspectWorkspace(root)
    ).rejects.toMatchObject({
      code: "WorkspaceNotFound"
    });
  });

  it("brokers only bound, unexpired, budgeted module contexts and isolates host faults", async () => {
    const root = await temporaryWorkspace();
    const engine = new WorkspaceEngine();
    await engine.createWorkspace({ root, name: "Runtime Workspace" });
    const clock = { now: new Date("2026-07-29T00:00:00.000Z") };
    const now = () => clock.now;
    const context = await engine.mintContext({ root, moduleId: "aimoto.files", ttlMs: 1_000, operationBudget: 1, now });
    const host = { invoke: async () => ({ echoed: "read" }) };
    await expect(engine.invokeModule({ root, moduleId: "aimoto.files", contextRef: context, command: "read", input: null, host, now }))
      .resolves.toEqual({ echoed: "read" });
    await expect(engine.invokeModule({ root, moduleId: "aimoto.files", contextRef: context, command: "read", input: null, host, now }))
      .rejects.toMatchObject({ code: "OperationBudgetExceeded" });

    const mismatch = await engine.mintContext({ root, moduleId: "aimoto.files", now });
    await expect(engine.invokeModule({ root, moduleId: "aimoto.tasks", contextRef: mismatch, command: "create", input: null, host, now }))
      .rejects.toMatchObject({ code: "ContextMismatch" });

    const expired = await engine.mintContext({ root, moduleId: "aimoto.files", ttlMs: 1, now });
    clock.now = new Date("2026-07-29T00:00:01.000Z");
    await expect(engine.invokeModule({ root, moduleId: "aimoto.files", contextRef: expired, command: "read", input: null, host, now }))
      .rejects.toMatchObject({ code: "ContextExpired" });

    const limited = await engine.mintContext({ root, moduleId: "aimoto.files", authorityCeiling: "suggest", now });
    await expect(engine.invokeModule({ root, moduleId: "aimoto.files", contextRef: limited, command: "write", input: null, host, requiredAuthority: "execute", now }))
      .rejects.toMatchObject({ code: "AuthorityExceeded" });

    const fault = await engine.mintContext({ root, moduleId: "aimoto.files", now });
    await expect(engine.invokeModule({ root, moduleId: "aimoto.files", contextRef: fault, command: "read", input: null, host: { invoke: async () => { throw new Error("child exited"); } }, now }))
      .rejects.toMatchObject({ code: "ModuleHostFault" });
  });

  it("binds approval to one exact ChangeSet and rejects a stale proposal", async () => {
    const root = await temporaryWorkspace();
    const engine = new WorkspaceEngine();
    const workspace = await engine.createWorkspace({ root, name: "Approval Test" });
    const first: ChangeSet = {
      schemaVersion: "1.0.0",
      changeSetId: "a9433a21-0279-452a-9d15-79cfab421b01",
      workspaceId: workspace.workspaceId,
      baseRevision: 0,
      createdAt: "2026-07-29T00:00:00.000Z",
      operations: [{
        operationId: "enable-build",
        kind: "workspace.set-authority-mode",
        input: { authorityMode: "build" },
        preconditions: [{ kind: "workspace.revision", value: 0 }],
        effects: ["workspace.settings.write"],
        reversibility: "reversible"
      }]
    };
    const second: ChangeSet = {
      ...first,
      changeSetId: "c9a4ab50-6b3a-4530-9d52-13e2b144ed02",
      operations: [{
        ...first.operations[0]!,
        operationId: "enable-execute",
        input: { authorityMode: "execute" }
      }]
    };
    const firstProposal = await engine.createProposal({
      root,
      changeSet: first,
      proposalId: "1d1e74c1-fbdd-4d8e-b3d5-998e756bd361"
    });
    const staleProposal = await engine.createProposal({
      root,
      changeSet: second,
      proposalId: "2de457b7-723d-4a5e-a1c3-f203eee4cb9c"
    });

    const committed = await engine.approveProposal({
      root,
      approval: {
        schemaVersion: "1.0.0",
        approvalId: "f9aa7024-2fe1-4b98-a7bb-e62865d4b35f",
        proposalId: firstProposal.proposalId,
        workspaceId: workspace.workspaceId,
        baseRevision: 0,
        changeSetDigest: firstProposal.changeSetDigest,
        approvedAt: "2026-07-29T00:01:00.000Z",
        approvedBy: "test-user"
      }
    });

    expect(committed).toMatchObject({ revision: 1, authorityMode: "build" });
    await expect(engine.approveProposal({
      root,
      approval: {
        schemaVersion: "1.0.0",
        approvalId: "536949a0-3f7c-45e9-adc3-cc1a7d6be58b",
        proposalId: staleProposal.proposalId,
        workspaceId: workspace.workspaceId,
        baseRevision: 0,
        changeSetDigest: staleProposal.changeSetDigest,
        approvedAt: "2026-07-29T00:02:00.000Z"
      }
    })).rejects.toMatchObject({ code: "ProposalStale" });
  });

  it("installs an approved, digest-verified generated Habit Tracker bundle", async () => {
    const root = await temporaryWorkspace();
    const engine = new WorkspaceEngine();
    const workspace = await engine.createWorkspace({ root, name: "Habit Workspace" });
    const moduleJson = '{"moduleId":"local.habit-tracker","version":"0.1.0"}';
    const files = [{ path: "module.json", content: moduleJson }];
    const digest = digestBundle(files);
    const directory = join(root, "foundry-staging", digest.slice("sha256:".length));
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "module.json"), moduleJson);
    const generated: FoundryProposal = {
      kind: "install-generated",
      requestId: "habit-request",
      plan: {
        requestId: "habit-request", moduleId: "local.habit-tracker", displayName: "Habit Tracker",
        userOutcomes: ["Log habits"], records: [], views: [], commands: [], events: [],
        requestedCapabilities: ["data.habit-entry.write"]
      },
      module: { moduleId: "local.habit-tracker", version: "0.1.0", digest, directory },
      requestedCapabilities: ["data.habit-entry.write"],
      checks: {
        staticValidation: { ok: true, diagnostics: [] },
        dryActivation: { ok: true, diagnostics: [] }
      }
    };
    const changeSet = proposalToModuleInstallChangeSet(generated, {
      workspaceId: workspace.workspaceId,
      baseRevision: 0,
      changeSetId: "86025cf5-3e2a-4eae-8e55-13b12ca5ccd1",
      operationId: "install-habit-tracker",
      createdAt: "2026-07-29T00:00:00.000Z"
    });
    const proposal = await engine.createProposal({
      root, changeSet, proposalId: "d01b09d6-95bd-4966-ad35-68b2ea89962d"
    });
    const committed = await engine.approveProposal({
      root,
      approval: {
        schemaVersion: "1.0.0", approvalId: "3c8275b4-1873-4324-a4d8-7488ef1e9f90",
        proposalId: proposal.proposalId, workspaceId: workspace.workspaceId, baseRevision: 0,
        changeSetDigest: proposal.changeSetDigest, approvedAt: "2026-07-29T00:01:00.000Z"
      }
    });

    expect(committed.modules).toEqual(expect.arrayContaining([expect.objectContaining({ moduleId: "local.habit-tracker", digest })]));
    await expect(readFile(join(root, ".aimoto", "modules", "local", digest.slice(7), "module.json"), "utf8"))
      .resolves.toBe(moduleJson);
  });

  it("creates, verifies, lists, and safely plans recovery snapshots", async () => {
    const root = await temporaryWorkspace();
    const engine = new WorkspaceEngine();
    await engine.createWorkspace({ root, name: "Snapshot Workspace" });
    const snapshot = await engine.createSnapshot(root);
    expect(snapshot.manifest.workspaceRevision).toBe(0);
    expect(snapshot.manifest.revisions.digest).toMatch(/^[a-f0-9]{64}$/);
    await expect(engine.inspectSnapshot(root, snapshot.snapshotId)).resolves.toMatchObject({ valid: true });
    await expect(engine.listSnapshots(root)).resolves.toMatchObject([{ snapshotId: snapshot.snapshotId, valid: true }]);
    await expect(engine.planSnapshotRestore(root, snapshot.snapshotId)).resolves.toMatchObject({
      kind: "restore-as-new-revision", baseRevision: 0, targetRevision: 1
    });
    expect((await engine.inspectWorkspace(root)).revision).toBe(0);
  });
});
