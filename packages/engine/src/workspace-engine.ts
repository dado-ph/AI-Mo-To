import { access, cp } from "node:fs/promises";
import { join, resolve } from "node:path";

import { verifyStagedModule } from "@ai-mo-to/foundry";

import {
  SCHEMA_VERSION,
  digestChangeSet,
  validateProtocol,
  type ApprovalRecord,
  type AuthorityMode,
  type ChangeSet,
  type ProposalRecord,
  type WorkspaceManifest
} from "@ai-mo-to/protocol";
import {
  ProposalCommitError,
  WorkspaceStore,
  initializeWorkspaceLayout,
  readWorkspaceManifest,
  workspaceDatabasePath,
  workspaceManifestPath,
  writeWorkspaceManifest
} from "@ai-mo-to/storage";

import { EngineError } from "./errors.js";

export interface CreateWorkspaceInput {
  root: string;
  name: string;
  workspaceId?: string;
  now?: () => Date;
}

export interface WorkspaceInspection {
  root: string;
  workspaceId: string;
  name: string;
  revision: number;
  createdAt: string;
  modules: WorkspaceManifest["modules"];
  authorityMode: WorkspaceManifest["authorityMode"];
  health: "ok";
}

export interface CreateProposalInput {
  root: string;
  changeSet: ChangeSet;
  proposalId: string;
  now?: () => Date;
}

export interface ApproveProposalInput {
  root: string;
  approval: ApprovalRecord;
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");

  if (slug.length >= 3 && /^[a-z]/.test(slug)) {
    return slug;
  }

  return `workspace-${slug || "local"}`.slice(0, 64);
}

function assertManifest(manifest: unknown): asserts manifest is WorkspaceManifest {
  const result = validateProtocol("workspace-manifest", manifest);
  if (!result.valid) {
    throw new EngineError(
      "ValidationFailed",
      "The workspace manifest does not satisfy the v1 contract.",
      { errors: result.errors }
    );
  }
}

function assertChangeSet(changeSet: unknown): asserts changeSet is ChangeSet {
  const result = validateProtocol("change-set", changeSet);
  if (!result.valid) {
    throw new EngineError("ValidationFailed", "The ChangeSet does not satisfy the v1 contract.", {
      errors: result.errors
    });
  }
}

function assertProposal(proposal: unknown): asserts proposal is ProposalRecord {
  const result = validateProtocol("proposal-record", proposal);
  if (!result.valid) {
    throw new EngineError("ValidationFailed", "The proposal does not satisfy the v1 contract.", {
      errors: result.errors
    });
  }
}

function assertApproval(approval: unknown): asserts approval is ApprovalRecord {
  const result = validateProtocol("approval-record", approval);
  if (!result.valid) {
    throw new EngineError("ValidationFailed", "The approval does not satisfy the v1 contract.", {
      errors: result.errors
    });
  }
}

function applyOperations(current: WorkspaceManifest, changeSet: ChangeSet): WorkspaceManifest {
  let next: WorkspaceManifest = structuredClone(current);
  for (const operation of changeSet.operations) {
    if (operation.kind === "workspace.set-authority-mode") {
      const authorityMode = operation.input.authorityMode;
      if (typeof authorityMode !== "string" || ![
        "observe", "suggest", "assist", "execute", "build"
      ].includes(authorityMode)) {
        throw new EngineError("ValidationFailed", "The authority mode operation is invalid.");
      }
      next = { ...next, authorityMode: authorityMode as AuthorityMode };
      continue;
    }

    if (operation.kind === "module.install") {
      const candidate = operation.input.module;
      if (!candidate || typeof candidate !== "object") {
        throw new EngineError("ValidationFailed", "The module install operation requires a module pin.");
      }
      const module = candidate as WorkspaceManifest["modules"][number];
      if (!module.moduleId || !module.version || !module.digest || !module.source) {
        throw new EngineError("ValidationFailed", "The module install operation contains an incomplete module pin.");
      }
      if (next.modules.some((pin) => pin.moduleId === module.moduleId)) {
        throw new EngineError("ValidationFailed", `Module ${module.moduleId} is already installed.`);
      }
      next = { ...next, modules: [...next.modules, module] };
      continue;
    }

    throw new EngineError("ValidationFailed", `Unsupported ChangeSet operation: ${operation.kind}.`);
  }
  return next;
}

async function prepareModuleBundles(root: string, changeSet: ChangeSet): Promise<void> {
  for (const operation of changeSet.operations) {
    if (operation.kind !== "module.install") continue;
    const candidate = operation.input.module;
    if (!candidate || typeof candidate !== "object") {
      throw new EngineError("ValidationFailed", "The module install operation requires a module pin.");
    }
    const module = candidate as WorkspaceManifest["modules"][number];
    if (module.source?.kind !== "local" || typeof module.source.reference !== "string") {
      throw new EngineError("ValidationFailed", "Generated module installation requires a local staged source.");
    }
    const verified = await verifyStagedModule(resolve(module.source.reference), module.digest);
    if (!verified) {
      throw new EngineError("ValidationFailed", "The staged module bytes do not match their declared digest.", {
        moduleId: module.moduleId,
        digest: module.digest
      });
    }
    const destination = join(root, ".aimoto", "modules", "local", module.digest.slice("sha256:".length));
    try {
      await access(destination);
    } catch {
      await cp(resolve(module.source.reference), destination, {
        recursive: true,
        errorOnExist: true,
        verbatimSymlinks: true
      });
    }
  }
}

export class WorkspaceEngine {
  async createWorkspace(
    input: CreateWorkspaceInput
  ): Promise<WorkspaceInspection> {
    const name = input.name.trim();
    if (!name) {
      throw new EngineError("InvalidInput", "Workspace name cannot be empty.");
    }

    const root = resolve(input.root);
    const manifestPath = workspaceManifestPath(root);
    try {
      await access(manifestPath);
      throw new EngineError(
        "InvalidInput",
        `A workspace already exists at ${root}.`
      );
    } catch (error) {
      if (error instanceof EngineError) {
        throw error;
      }
    }

    const manifest: WorkspaceManifest = {
      schemaVersion: SCHEMA_VERSION,
      workspaceId: slugify(input.workspaceId ?? name),
      name,
      createdAt: (input.now ?? (() => new Date()))().toISOString(),
      revision: 0,
      modules: [],
      layout: {
        homeView: "workspace.home",
        views: []
      },
      capabilities: [],
      eventRoutes: [],
      aiAdapter: "none",
      authorityMode: "suggest",
      contextPolicy: "bounded-v1",
      snapshotPolicy: "on-structural-change"
    };
    assertManifest(manifest);

    await initializeWorkspaceLayout(root);
    const store = new WorkspaceStore(workspaceDatabasePath(root));
    try {
      store.initialize();
      store.create(manifest);
      await writeWorkspaceManifest(root, manifest);
    } finally {
      store.close();
    }

    return this.inspectWorkspace(root);
  }

  async inspectWorkspace(rootInput: string): Promise<WorkspaceInspection> {
    const root = resolve(rootInput);
    let fileManifest: WorkspaceManifest;
    try {
      fileManifest = await readWorkspaceManifest(root);
    } catch {
      throw new EngineError(
        "WorkspaceNotFound",
        `No AI-Mo-To workspace exists at ${root}.`
      );
    }
    assertManifest(fileManifest);

    const store = new WorkspaceStore(workspaceDatabasePath(root));
    try {
      store.initialize();
      const stored = store.inspect();
      if (!stored) {
        throw new EngineError(
          "WorkspaceNotFound",
          `The workspace database at ${root} has no workspace metadata.`
        );
      }

      if (
        stored.workspaceId !== fileManifest.workspaceId ||
        stored.revision !== fileManifest.revision
      ) {
        throw new EngineError(
          "ValidationFailed",
          "The workspace manifest and database disagree.",
          {
            manifestWorkspaceId: fileManifest.workspaceId,
            databaseWorkspaceId: stored.workspaceId,
            manifestRevision: fileManifest.revision,
            databaseRevision: stored.revision
          }
        );
      }

      return {
        root,
        workspaceId: fileManifest.workspaceId,
        name: fileManifest.name,
        revision: fileManifest.revision,
        createdAt: fileManifest.createdAt,
        modules: fileManifest.modules,
        authorityMode: fileManifest.authorityMode,
        health: "ok"
      };
    } finally {
      store.close();
    }
  }

  async createProposal(input: CreateProposalInput): Promise<ProposalRecord> {
    const root = resolve(input.root);
    assertChangeSet(input.changeSet);
    const inspection = await this.inspectWorkspace(root);
    if (input.changeSet.workspaceId !== inspection.workspaceId) {
      throw new EngineError("InvalidInput", "The ChangeSet targets a different workspace.");
    }
    if (input.changeSet.baseRevision !== inspection.revision) {
      throw new EngineError("ProposalStale", "The ChangeSet base revision is no longer current.", {
        baseRevision: input.changeSet.baseRevision,
        currentRevision: inspection.revision
      });
    }

    const proposal: ProposalRecord = {
      schemaVersion: SCHEMA_VERSION,
      proposalId: input.proposalId,
      workspaceId: inspection.workspaceId,
      baseRevision: inspection.revision,
      changeSet: input.changeSet,
      changeSetDigest: digestChangeSet(input.changeSet),
      status: "pending",
      createdAt: (input.now ?? (() => new Date()))().toISOString()
    };
    assertProposal(proposal);

    const store = new WorkspaceStore(workspaceDatabasePath(root));
    try {
      store.initialize();
      store.stageProposal({
        proposalId: proposal.proposalId,
        changeSetHash: proposal.changeSetDigest,
        baseRevision: proposal.baseRevision,
        status: "pending",
        changeSet: proposal.changeSet,
        createdAt: proposal.createdAt
      });
    } finally {
      store.close();
    }
    return proposal;
  }

  async approveProposal(input: ApproveProposalInput): Promise<WorkspaceInspection> {
    const root = resolve(input.root);
    assertApproval(input.approval);
    const store = new WorkspaceStore(workspaceDatabasePath(root));
    try {
      store.initialize();
      const proposal = store.getProposal(input.approval.proposalId);
      if (!proposal) {
        throw new EngineError("ProposalNotFound", "The proposal does not exist.");
      }
      const changeSet = proposal.changeSet as ChangeSet;
      const expectedDigest = digestChangeSet(changeSet);
      if (expectedDigest !== input.approval.changeSetDigest || proposal.changeSetHash !== expectedDigest) {
        throw new EngineError("ValidationFailed", "The approval does not bind the staged ChangeSet bytes.");
      }
      if (input.approval.workspaceId !== changeSet.workspaceId || input.approval.baseRevision !== changeSet.baseRevision) {
        throw new EngineError("ValidationFailed", "The approval does not bind the staged workspace revision.");
      }
      await prepareModuleBundles(root, changeSet);

      let manifest: WorkspaceManifest;
      try {
        manifest = store.commitProposal({
          proposalId: input.approval.proposalId,
          expectedHash: input.approval.changeSetDigest,
          approvalId: input.approval.approvalId,
          principalId: input.approval.approvedBy ?? "local-user",
          approvedAt: input.approval.approvedAt,
          transformManifest: (current, stagedChangeSet) => applyOperations(current, stagedChangeSet as ChangeSet)
        });
      } catch (error) {
        if (error instanceof ProposalCommitError) {
          const code = error.code === "ProposalStale" ? "ProposalStale" : error.code === "ProposalNotFound" ? "ProposalNotFound" : "ApprovalRequired";
          throw new EngineError(code, error.message);
        }
        throw error;
      }
      await writeWorkspaceManifest(root, manifest);
    } finally {
      store.close();
    }
    return this.inspectWorkspace(root);
  }

  getProposal(rootInput: string, proposalId: string): ProposalRecord {
    const root = resolve(rootInput);
    const store = new WorkspaceStore(workspaceDatabasePath(root));
    try {
      store.initialize();
      const stored = store.getProposal(proposalId);
      if (!stored) {
        throw new EngineError("ProposalNotFound", "The proposal does not exist.");
      }
      const changeSet = stored.changeSet as ChangeSet;
      const proposal: ProposalRecord = {
        schemaVersion: SCHEMA_VERSION,
        proposalId: stored.proposalId,
        workspaceId: changeSet.workspaceId,
        baseRevision: stored.baseRevision,
        changeSet,
        changeSetDigest: stored.changeSetHash as ProposalRecord["changeSetDigest"],
        status: stored.status === "committed" ? "applied" : stored.status,
        createdAt: stored.createdAt
      };
      assertProposal(proposal);
      return proposal;
    } finally {
      store.close();
    }
  }
}
