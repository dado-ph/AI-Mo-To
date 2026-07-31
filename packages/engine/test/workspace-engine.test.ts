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
  createHabitTrackerBundle,
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

    const ungranted = await engine.mintContext({ root, moduleId: "aimoto.files", now });
    await expect(engine.invokeModule({ root, moduleId: "aimoto.files", contextRef: ungranted, command: "network", input: null, host, requiredCapabilities: ["network.example.read"], now }))
      .rejects.toMatchObject({ code: "CapabilityDenied" });

    const fault = await engine.mintContext({ root, moduleId: "aimoto.files", now });
    await expect(engine.invokeModule({ root, moduleId: "aimoto.files", contextRef: fault, command: "read", input: null, host: { invoke: async () => { throw new Error("child exited"); } }, now }))
      .rejects.toMatchObject({ code: "ModuleHostFault" });
  });

  it("executes durable Files and Tasks commands with engine-derived metadata and version preconditions", async () => {
    const root = await temporaryWorkspace();
    const engine = new WorkspaceEngine();
    await engine.createWorkspace({ root, name: "Household Work" });
    const clock = { now: new Date("2026-07-29T08:00:00.000Z") };
    const now = () => clock.now;

    const task = await engine.executeBuiltInCommand({
      root, moduleId: "aimoto.tasks", command: "create", now,
      input: { taskId: "buy-rice", title: "Buy rice", notes: "For dinner", dueAt: null }
    });
    expect(task).toMatchObject({
      recordId: "buy-rice", version: 1,
      data: { title: "Buy rice", status: "open", version: 1, createdAt: "2026-07-29T08:00:00.000Z" }
    });

    clock.now = new Date("2026-07-29T09:00:00.000Z");
    const completed = await engine.executeBuiltInCommand({
      root, moduleId: "aimoto.tasks", command: "complete", now,
      input: { taskId: "buy-rice", expectedVersion: 1 }
    });
    expect(completed).toMatchObject({
      recordId: "buy-rice", version: 2,
      data: { status: "done", version: 2, updatedAt: "2026-07-29T09:00:00.000Z" }
    });
    await expect(engine.executeBuiltInCommand({
      root, moduleId: "aimoto.tasks", command: "reopen", now,
      input: { taskId: "buy-rice", expectedVersion: 1 }
    })).rejects.toMatchObject({ code: "VersionConflict" });

    await engine.executeBuiltInCommand({
      root, moduleId: "aimoto.files", command: "register", now,
      input: { fileId: "meal-plan", name: "Meal plan", relativePath: "files/meal-plan.txt", kind: "file", size: 42 }
    });
    expect(await engine.listBuiltInRecords(root, "aimoto.files")).toMatchObject([
      { recordId: "meal-plan", data: { name: "Meal plan", relativePath: "files/meal-plan.txt" } }
    ]);

    const reopened = new WorkspaceEngine();
    await expect(reopened.getBuiltInRecord(root, "aimoto.tasks", "buy-rice"))
      .resolves.toMatchObject({ version: 2, data: { status: "done" } });
  });

  it("rejects invalid built-in command data before mutation", async () => {
    const root = await temporaryWorkspace();
    const engine = new WorkspaceEngine();
    await engine.createWorkspace({ root, name: "Validated Records" });

    await expect(engine.executeBuiltInCommand({
      root, moduleId: "aimoto.files", command: "register",
      input: { fileId: "escape", name: "Escape", relativePath: "../secret.txt", kind: "file" }
    })).rejects.toMatchObject({ code: "ValidationFailed" });
    await expect(engine.executeBuiltInCommand({
      root, moduleId: "aimoto.tasks", command: "create",
      input: { taskId: "empty", title: " " }
    })).rejects.toMatchObject({ code: "ValidationFailed" });
    await expect(engine.executeBuiltInCommand({
      root, moduleId: "aimoto.tasks", command: "delete",
      input: { taskId: "anything", expectedVersion: 1 }
    })).rejects.toMatchObject({ code: "CommandNotFound" });

    expect(await engine.listBuiltInRecords(root, "aimoto.files")).toEqual([]);
    expect(await engine.listBuiltInRecords(root, "aimoto.tasks")).toEqual([]);
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

    const evidence = (await engine.inspectWorkspace(root)).evidence;
    expect(evidence.revisions).toEqual([
      expect.objectContaining({ revision: 0, reason: "workspace.created" }),
      expect.objectContaining({ revision: 1, reason: "proposal.committed" })
    ]);
    expect(evidence.proposals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        proposalId: firstProposal.proposalId,
        changeSetDigest: firstProposal.changeSetDigest,
        status: "committed",
        appliedRevision: 1
      })
    ]));
    expect(evidence.approvals).toEqual([expect.objectContaining({
      proposalId: firstProposal.proposalId,
      changeSetDigest: firstProposal.changeSetDigest,
      principalId: "test-user"
    })]);
    expect(evidence.recordHealth).toEqual({
      status: "ok", totalRecords: 0, totalEvents: 0, collections: []
    });
  });

  it("installs an approved, digest-verified generated Habit Tracker bundle", async () => {
    const root = await temporaryWorkspace();
    const engine = new WorkspaceEngine();
    const workspace = await engine.createWorkspace({ root, name: "Habit Workspace" });
    const bundle = createHabitTrackerBundle();
    const files = bundle.files;
    const digest = digestBundle(files);
    const directory = join(root, "foundry-staging", digest.slice("sha256:".length));
    for (const file of files) {
      await mkdir(join(directory, file.path, ".."), { recursive: true });
      await writeFile(join(directory, file.path), file.content);
    }
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
    await expect(engine.listInstalledModuleViews(root, "local.habit-tracker")).resolves.toMatchObject([
      { id: "habits", title: "Habits", kind: "list", collection: "habit" },
      { id: "daily-check-in", title: "Daily check-in", kind: "form", collection: "habit-entry" },
      { id: "history", title: "Completion history", kind: "timeline", collection: "habit-entry" }
    ]);
    const habit = await engine.executeHabitTrackerCommand({
      root, command: "create-habit", input: { habitId: "meditate", name: "Meditate" }
    });
    await engine.executeHabitTrackerCommand({
      root, command: "log-completion",
      input: { entryId: "meditate-2026-07-29", habitId: habit.recordId, completedOn: "2026-07-29" }
    });
    await expect(engine.listHabitTrackerRecords(root, "habit-entry")).resolves.toMatchObject([
      { recordId: "meditate-2026-07-29", data: { habitId: "meditate", completedOn: "2026-07-29" } }
    ]);
    const snapshot = await engine.createSnapshot(root);
    await engine.executeHabitTrackerCommand({
      root, command: "create-habit", input: { habitId: "temporary", name: "Temporary" }
    });
    const restore = await engine.createSnapshotRestoreProposal({
      root, snapshotId: snapshot.snapshotId, proposalId: "45a0a6a9-f2b8-4bd6-a288-9ea0139c02c5"
    });
    await engine.approveProposal({ root, approval: {
      schemaVersion: "1.0.0", approvalId: "5d47936b-2b87-4bac-8841-ed2613236513",
      proposalId: restore.proposalId, workspaceId: workspace.workspaceId, baseRevision: 1,
      changeSetDigest: restore.changeSetDigest, approvedAt: "2026-07-29T00:02:00.000Z"
    }});
    await expect(engine.listHabitTrackerRecords(root, "habit")).resolves.toEqual([
      expect.objectContaining({ recordId: "meditate", version: 1, data: { habitId: "meditate", name: "Meditate" } })
    ]);
  });

  it("commits an agent-proposed workspace surface with the generated app", async () => {
    const root = await temporaryWorkspace();
    const engine = new WorkspaceEngine();
    const workspace = await engine.createWorkspace({ root, name: "Generated Notebook" });
    const bundle = createHabitTrackerBundle();
    const digest = digestBundle(bundle.files);
    const directory = join(root, "generated-app");
    for (const file of bundle.files) {
      await mkdir(join(directory, file.path, ".."), { recursive: true });
      await writeFile(join(directory, file.path), file.content);
    }
    const proposal = await engine.createProposal({ root, proposalId: "b1f3a7d4-2f1d-4ed9-b7f2-13dfd86ed4a4", changeSet: {
      schemaVersion: "1.0.0", changeSetId: "7b4cb9aa-4d6f-47de-bf0b-e7f5f3c0e924", workspaceId: workspace.workspaceId,
      baseRevision: 0, createdAt: "2026-07-29T00:00:00.000Z", operations: [{
        operationId: "install-generated-notebook", kind: "module.install", input: {
          module: { moduleId: "local.generated-notebook", version: "0.1.0", digest, source: { kind: "local", reference: directory } },
          workspaceLayout: { homeView: "notebook.home", views: [{ id: "notebook.home", moduleId: "local.generated-notebook", viewId: "home" }] }
        }, preconditions: [], effects: ["app.generated.install"], reversibility: "transactional"
      }]
    }});
    const committed = await engine.approveProposal({ root, approval: { schemaVersion: "1.0.0", approvalId: "71d1b398-9b4d-4b2a-9c6f-a1b1d37cb0aa", proposalId: proposal.proposalId, workspaceId: workspace.workspaceId, baseRevision: 0, changeSetDigest: proposal.changeSetDigest, approvedAt: "2026-07-29T00:01:00.000Z" } });
    expect(committed.layout).toEqual({ homeView: "notebook.home", views: [{ id: "notebook.home", moduleId: "local.generated-notebook", viewId: "home" }] });
    expect(committed.modules).toEqual(expect.arrayContaining([expect.objectContaining({ moduleId: "local.generated-notebook" })]));
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

  it("restores a verified snapshot only through a digest-bound approval and retains revision history", async () => {
    const root = await temporaryWorkspace();
    const engine = new WorkspaceEngine();
    const workspace = await engine.createWorkspace({ root, name: "Recoverable Workspace" });
    await engine.executeBuiltInCommand({
      root, moduleId: "aimoto.files", command: "register", now: () => new Date("2026-07-29T00:00:00.000Z"),
      input: { fileId: "plan", name: "Original plan", relativePath: "files/plan.txt", kind: "file" }
    });
    await engine.executeBuiltInCommand({
      root, moduleId: "aimoto.tasks", command: "create", now: () => new Date("2026-07-29T00:00:00.000Z"),
      input: { taskId: "review", title: "Review original", notes: "", dueAt: null }
    });
    const snapshot = await engine.createSnapshot(root);
    await engine.executeBuiltInCommand({
      root, moduleId: "aimoto.files", command: "remove", now: () => new Date("2026-07-29T00:00:30.000Z"),
      input: { fileId: "plan", expectedVersion: 1 }
    });
    await engine.executeBuiltInCommand({
      root, moduleId: "aimoto.tasks", command: "complete", now: () => new Date("2026-07-29T00:00:30.000Z"),
      input: { taskId: "review", expectedVersion: 1 }
    });
    const changed = await engine.createProposal({
      root,
      proposalId: "2c598c7f-1aef-4f6d-aecf-b6c4dc71410e",
      changeSet: {
        schemaVersion: "1.0.0", changeSetId: "9f4a3d8e-7ca7-4e80-95ee-e00ca44f1d7f",
        workspaceId: workspace.workspaceId, baseRevision: 0, createdAt: "2026-07-29T00:00:00.000Z",
        operations: [{ operationId: "enable-build", kind: "workspace.set-authority-mode", input: { authorityMode: "build" }, preconditions: [], effects: ["workspace.settings.write"], reversibility: "reversible" }],
      },
    });
    await engine.approveProposal({ root, approval: {
      schemaVersion: "1.0.0", approvalId: "a2bc5d47-ecf7-4b8a-af4c-096b27f32964", proposalId: changed.proposalId,
      workspaceId: workspace.workspaceId, baseRevision: 0, changeSetDigest: changed.changeSetDigest, approvedAt: "2026-07-29T00:01:00.000Z",
    }});
    const restore = await engine.createSnapshotRestoreProposal({ root, snapshotId: snapshot.snapshotId, proposalId: "d3a1e979-2ae6-4af4-bd0e-6e67058df4f5" });
    expect(restore.changeSet).toMatchObject({ baseRevision: 1, operations: [expect.objectContaining({ kind: "workspace.restore-snapshot", input: expect.objectContaining({ snapshotId: snapshot.snapshotId }) })] });
    await expect(engine.approveProposal({ root, approval: {
      schemaVersion: "1.0.0", approvalId: "e45546d9-6e17-424c-b18d-47a0eaf70d00", proposalId: restore.proposalId,
      workspaceId: workspace.workspaceId, baseRevision: 1, changeSetDigest: `sha256:${"0".repeat(64)}`, approvedAt: "2026-07-29T00:01:30.000Z",
    }})).rejects.toMatchObject({ code: "ValidationFailed" });
    await expect(engine.getBuiltInRecord(root, "aimoto.tasks", "review")).resolves.toMatchObject({
      version: 2, data: { status: "done" }
    });
    const recovered = await engine.approveProposal({ root, approval: {
      schemaVersion: "1.0.0", approvalId: "e45546d9-6e17-424c-b18d-47a0eaf70d0f", proposalId: restore.proposalId,
      workspaceId: workspace.workspaceId, baseRevision: 1, changeSetDigest: restore.changeSetDigest, approvedAt: "2026-07-29T00:02:00.000Z",
    }});
    expect(recovered).toMatchObject({ revision: 2, authorityMode: "suggest" });
    await expect(engine.getBuiltInRecord(root, "aimoto.files", "plan")).resolves.toMatchObject({
      version: 1, data: { name: "Original plan", relativePath: "files/plan.txt" }
    });
    await expect(engine.getBuiltInRecord(root, "aimoto.tasks", "review")).resolves.toMatchObject({
      version: 1, data: { title: "Review original", status: "open" }
    });
    const store = new (await import("@ai-mo-to/storage")).WorkspaceStore(workspaceDatabasePath(root));
    try { expect(store.listRevisions().map((entry) => entry.revision)).toEqual([0, 1, 2]); } finally { store.close(); }
  });

  it("rejects a stale restore approval without changing the workspace", async () => {
    const root = await temporaryWorkspace();
    const engine = new WorkspaceEngine();
    const workspace = await engine.createWorkspace({ root, name: "Stale Recovery" });
    await engine.executeBuiltInCommand({
      root, moduleId: "aimoto.tasks", command: "create",
      input: { taskId: "safe", title: "Must remain", notes: "", dueAt: null }
    });
    const snapshot = await engine.createSnapshot(root);
    const restore = await engine.createSnapshotRestoreProposal({ root, snapshotId: snapshot.snapshotId, proposalId: "a1dc3b3c-3aa5-4446-98da-b9f6cbc60ff9" });
    const advance = await engine.createProposal({ root, proposalId: "7e4c7f65-5a5e-4b87-9efa-ecc70cdd1c58", changeSet: {
      schemaVersion: "1.0.0", changeSetId: "7581cad4-daf6-4b97-8ca9-f72ea0a62047", workspaceId: workspace.workspaceId, baseRevision: 0, createdAt: "2026-07-29T00:00:00.000Z",
      operations: [{ operationId: "advance", kind: "workspace.set-authority-mode", input: { authorityMode: "assist" }, preconditions: [], effects: ["workspace.settings.write"], reversibility: "reversible" }],
    }});
    await engine.approveProposal({ root, approval: { schemaVersion: "1.0.0", approvalId: "5e2c723a-706c-4bc8-9c32-c6f0c7de5e08", proposalId: advance.proposalId, workspaceId: workspace.workspaceId, baseRevision: 0, changeSetDigest: advance.changeSetDigest, approvedAt: "2026-07-29T00:01:00.000Z" } });
    await expect(engine.approveProposal({ root, approval: { schemaVersion: "1.0.0", approvalId: "71844b69-2b6e-4fca-b593-7a75d83df667", proposalId: restore.proposalId, workspaceId: workspace.workspaceId, baseRevision: 0, changeSetDigest: restore.changeSetDigest, approvedAt: "2026-07-29T00:02:00.000Z" } })).rejects.toMatchObject({ code: "ProposalStale" });
    await expect(engine.inspectWorkspace(root)).resolves.toMatchObject({ revision: 1, authorityMode: "assist" });
    await expect(engine.getBuiltInRecord(root, "aimoto.tasks", "safe")).resolves.toMatchObject({
      version: 1, data: { title: "Must remain" }
    });
  });

  it("enforces AuthorityStateGuard in observe mode", async () => {
    const root = await temporaryWorkspace();
    const engine = new WorkspaceEngine();
    // Create workspace with dynamic randomized prompt/name
    const randomPrompt = `Workspace prompt ${Math.random().toString(36).substring(2, 10)}`;
    const workspace = await engine.createWorkspace({ root, name: randomPrompt });

    // Advance to observe mode by writing manifest directly for testing read-only state
    const manifestPath = join(root, ".aimoto", "workspace.json");
    const manifestContent = JSON.parse(await readFile(manifestPath, "utf8"));
    manifestContent.authorityMode = "observe";
    await writeFile(manifestPath, JSON.stringify(manifestContent, null, 2));

    // Observe mode should block direct mutation commands
    await expect(
      engine.executeBuiltInCommand({
        root,
        moduleId: "aimoto.tasks",
        command: "create",
        input: { taskId: "task1", title: "Forbidden write", notes: "", dueAt: null }
      })
    ).rejects.toThrow(/observe/);
  });
});
