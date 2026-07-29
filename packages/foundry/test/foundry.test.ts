import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  Foundry,
  FoundryProposalConversionError,
  digestBundle,
  proposalToModuleInstallChangeSet,
  verifyStagedModule,
} from "../src/index.js";
import type { FoundryProposal, GeneratedModuleBundle, ModulePlan } from "../src/index.js";

const plan: ModulePlan = {
  requestId: "request-habits",
  moduleId: "local.habit-tracker",
  displayName: "Habit Tracker",
  userOutcomes: ["Log and review daily habits"],
  records: [{ name: "habit-entry", purpose: "A dated habit completion" }],
  views: [{ id: "log", kind: "form" }, { id: "history", kind: "list" }],
  commands: ["log-entry"],
  events: ["entry-logged"],
  requestedCapabilities: ["data.habit-entry.write"],
};

const bundle: GeneratedModuleBundle = {
  moduleId: plan.moduleId,
  version: "0.1.0",
  requestedCapabilities: plan.requestedCapabilities,
  files: [
    { path: "module.json", content: JSON.stringify({ id: plan.moduleId, version: "0.1.0" }) },
    { path: "schemas/habit-entry.json", content: JSON.stringify({ type: "object" }) },
    { path: "views/log.json", content: JSON.stringify({ kind: "form" }) },
    { path: "views/history.json", content: JSON.stringify({ kind: "list" }) },
    { path: "handlers/log.js", content: "export async function logEntry() {}" },
    { path: "test/contract.test.js", content: "export const contract = true;" },
  ],
};

describe("Foundry staging", () => {
  it("stages Habit Tracker without mutating the active workspace", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "aimoto-foundry-"));
    const activeWorkspace = path.join(root, "active");
    const stagingRoot = path.join(root, "staging");
    await mkdir(activeWorkspace);
    const sentinel = path.join(activeWorkspace, "workspace.json");
    await writeFile(sentinel, '{"revision":7}');

    let dryState = "";
    const foundry = new Foundry(stagingRoot, {
      selector: { select: vi.fn().mockResolvedValue(undefined) },
      generator: { generate: vi.fn().mockResolvedValue(bundle) },
      staticValidator: {
        validate: async (module) => ({
          ok: (await readFile(path.join(module.directory, "module.json"), "utf8")).includes(
            "habit-tracker",
          ),
          diagnostics: [],
        }),
      },
      dryActivator: {
        activate: async (_module, disposableStateDirectory) => {
          dryState = disposableStateDirectory;
          await writeFile(path.join(disposableStateDirectory, "state.json"), "{}");
          return { ok: true, diagnostics: [] };
        },
      },
    });

    const result = await foundry.stage(
      { requestId: plan.requestId, workspaceId: "workspace-1", text: "Add a Habit Tracker" },
      plan,
    );

    expect(result.ok).toBe(true);
    if (!result.ok || result.proposal.kind !== "install-generated") return;
    expect(result.proposal.module.digest).toBe(digestBundle(bundle.files));
    expect(result.proposal.module.directory).toBe(
      path.join(stagingRoot, result.proposal.module.digest.slice(7)),
    );
    expect(dryState.startsWith(result.proposal.module.directory)).toBe(true);
    expect(dryState.startsWith(activeWorkspace)).toBe(false);
    expect(await readFile(sentinel, "utf8")).toBe('{"revision":7}');
  });

  it("selects an existing module before invoking generation", async () => {
    const generator = vi.fn();
    const foundry = new Foundry("unused", {
      selector: {
        select: async () => ({
          moduleId: "verified.habits",
          version: "1.2.0",
          digest: `sha256:${"a".repeat(64)}`,
        }),
      },
      generator: { generate: generator },
      staticValidator: { validate: vi.fn() },
      dryActivator: { activate: vi.fn() },
    });
    const result = await foundry.stage(
      { requestId: plan.requestId, workspaceId: "workspace-1", text: "habits" },
      plan,
    );
    expect(result.ok && result.proposal.kind).toBe("use-existing");
    expect(generator).not.toHaveBeenCalled();
  });

  it("returns validation failure without dry activation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "aimoto-foundry-"));
    const activate = vi.fn();
    const foundry = new Foundry(root, {
      selector: { select: async () => undefined },
      generator: { generate: async () => bundle },
      staticValidator: {
        validate: async () => ({
          ok: false,
          diagnostics: [{ code: "ManifestInvalid", message: "invalid manifest" }],
        }),
      },
      dryActivator: { activate },
    });
    const result = await foundry.stage(
      { requestId: plan.requestId, workspaceId: "workspace-1", text: "habits" },
      plan,
    );
    expect(result).toMatchObject({ ok: false, phase: "static-validation" });
    expect(activate).not.toHaveBeenCalled();
  });

  it("converts the staged Habit Tracker into a digest-bound module.install ChangeSet", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "aimoto-foundry-"));
    const foundry = new Foundry(root, {
      selector: { select: async () => undefined },
      generator: { generate: async () => bundle },
      staticValidator: { validate: async () => ({ ok: true, diagnostics: [] }) },
      dryActivator: { activate: async () => ({ ok: true, diagnostics: [] }) },
    });
    const result = await foundry.stage(
      { requestId: plan.requestId, workspaceId: "workspace-1", text: "Add a Habit Tracker" },
      plan,
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.proposal.kind !== "install-generated") return;

    const changeSet = proposalToModuleInstallChangeSet(result.proposal, {
      workspaceId: "workspace-1",
      baseRevision: 7,
      changeSetId: "f5ff70b7-8b67-4d66-b805-ebf0b0a35643",
      operationId: "install-habit-tracker",
      createdAt: "2026-07-29T10:00:00.000Z",
    });

    // The returned value is typed as the portable protocol ChangeSet contract.
    expect(changeSet.schemaVersion).toBe("1.0.0");
    expect(changeSet.operations).toHaveLength(1);
    expect(changeSet.operations[0]).toMatchObject({
      kind: "module.install",
      input: {
        module: {
          moduleId: "local.habit-tracker",
          digest: result.proposal.module.digest,
          source: { kind: "local", reference: result.proposal.module.directory },
        },
        stagedDigest: result.proposal.module.digest,
      },
      preconditions: [
        { kind: "workspace.revision.equals", value: 7 },
        { kind: "module.digest.equals", value: result.proposal.module.digest },
      ],
      effects: ["capability.request:data.habit-entry.write"],
    });
    expect(await verifyStagedModule(result.proposal.module.directory, result.proposal.module.digest)).toBe(true);

    await writeFile(path.join(result.proposal.module.directory, "views/log.json"), "tampered");
    expect(await verifyStagedModule(result.proposal.module.directory, result.proposal.module.digest)).toBe(false);
  });

  it("rejects existing-module proposals rather than treating them as local generated bundles", () => {
    const existing: FoundryProposal = {
      kind: "use-existing",
      requestId: plan.requestId,
      plan,
      module: { moduleId: "verified.habits", version: "1.2.0", digest: `sha256:${"a".repeat(64)}` },
    };
    expect(() => proposalToModuleInstallChangeSet(existing, {
      workspaceId: "workspace-1",
      baseRevision: 0,
      changeSetId: "f5ff70b7-8b67-4d66-b805-ebf0b0a35643",
      operationId: "install-existing",
      createdAt: "2026-07-29T10:00:00.000Z",
    })).toThrow(FoundryProposalConversionError);
  });
});
