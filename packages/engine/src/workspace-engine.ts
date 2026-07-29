import { access, cp, readdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { digestBundle, verifyStagedModule } from "@ai-mo-to/foundry";

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
import {
  createSnapshot,
  listSnapshots,
  planRestore,
  verifySnapshot,
  type CreatedSnapshot,
  type RestorePlan,
  type SnapshotSummary,
  type SnapshotVerification
} from "@ai-mo-to/snapshot";

import { EngineError } from "./errors.js";

const AUTHORITY_RANK: Record<AuthorityMode, number> = {
  observe: 0, suggest: 1, assist: 2, execute: 3, build: 4
};
type ModuleJsonValue = null | boolean | number | string | ModuleJsonValue[] | { [key: string]: ModuleJsonValue };

export interface ModuleHostClient {
  invoke(params: { context_ref: string; command: string; input: ModuleJsonValue }): Promise<ModuleJsonValue>;
}

interface ContextGrant {
  workspaceId: string;
  moduleId: string;
  revision: number;
  expiresAt: number;
  remainingOperations: number;
  authorityCeiling: AuthorityMode;
}

export interface MintContextInput {
  root: string;
  moduleId: string;
  ttlMs?: number;
  operationBudget?: number;
  authorityCeiling?: AuthorityMode;
  now?: () => Date;
}

export interface InvokeModuleInput {
  root: string;
  moduleId: string;
  contextRef: string;
  command: string;
  input: ModuleJsonValue;
  host: ModuleHostClient;
  requiredAuthority?: AuthorityMode;
  now?: () => Date;
}

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
  layout: WorkspaceManifest["layout"];
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

async function bundleFiles(directory: string, relative = ""): Promise<Array<{ path: string; content: Uint8Array }>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: Array<{ path: string; content: Uint8Array }> = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await bundleFiles(path, name));
    else if (entry.isFile()) files.push({ path: name, content: await readFile(path) });
  }
  return files;
}

async function builtInModulePins(): Promise<WorkspaceManifest["modules"]> {
  const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
  return Promise.all(["files", "tasks"].map(async (name) => {
    const directory = join(repositoryRoot, "modules", name);
    const manifest = JSON.parse(await readFile(join(directory, "module.json"), "utf8")) as { moduleId: string; version: string };
    return {
      moduleId: manifest.moduleId,
      version: manifest.version,
      digest: digestBundle(await bundleFiles(directory)),
      source: { kind: "builtin" as const, reference: `builtin:${name}` }
    };
  }));
}

function moduleBundleDirectory(root: string, module: WorkspaceManifest["modules"][number]): string {
  if (module.source.kind === "builtin") {
    const name = module.source.reference.replace(/^builtin:/, "");
    return join(fileURLToPath(new URL("../../../", import.meta.url)), "modules", name);
  }
  return join(root, ".aimoto", "modules", "local", module.digest.slice("sha256:".length));
}

async function readContext(root: string): Promise<Record<string, string>> {
  const contextRoot = join(root, ".aimoto", "context");
  try {
    const names = await readdir(contextRoot, { recursive: true }) as string[];
    const entries = await Promise.all(names.map(async (name) => {
      const path = join(contextRoot, name);
      try { return [name, await readFile(path, "utf8")] as const; } catch { return undefined; }
    }));
    return Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry)));
  } catch { return {}; }
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
  readonly #contexts = new Map<string, ContextGrant>();

  /** Creates an opaque, in-memory invocation grant. It is never persisted or exposed to a module except by reference. */
  async mintContext(input: MintContextInput): Promise<string> {
    const workspace = await this.inspectWorkspace(input.root);
    if (!workspace.modules.some((pin) => pin.moduleId === input.moduleId)) {
      throw new EngineError("ModuleNotInstalled", `Module ${input.moduleId} is not installed in this workspace.`);
    }
    const ttlMs = input.ttlMs ?? 60_000;
    const operationBudget = input.operationBudget ?? 1;
    const authorityCeiling = input.authorityCeiling ?? workspace.authorityMode;
    if (ttlMs <= 0 || operationBudget <= 0 || AUTHORITY_RANK[authorityCeiling] > AUTHORITY_RANK[workspace.authorityMode]) {
      throw new EngineError("InvalidInput", "The context grant exceeds the workspace authority or has an invalid lifetime/budget.");
    }
    const reference = `ctx_${randomUUID()}`;
    this.#contexts.set(reference, {
      workspaceId: workspace.workspaceId, moduleId: input.moduleId, revision: workspace.revision,
      expiresAt: (input.now ?? (() => new Date()))().getTime() + ttlMs,
      remainingOperations: operationBudget, authorityCeiling
    });
    return reference;
  }

  /** Brokers a dynamic handler call after checking the engine-owned context grant. */
  async invokeModule(input: InvokeModuleInput): Promise<ModuleJsonValue> {
    const workspace = await this.inspectWorkspace(input.root);
    const grant = this.#contexts.get(input.contextRef);
    if (!grant) throw new EngineError("ContextNotFound", "The invocation context does not exist.");
    if (grant.workspaceId !== workspace.workspaceId || grant.moduleId !== input.moduleId || grant.revision !== workspace.revision) {
      throw new EngineError("ContextMismatch", "The invocation context is not bound to this workspace, module, and revision.");
    }
    if ((input.now ?? (() => new Date()))().getTime() >= grant.expiresAt) {
      this.#contexts.delete(input.contextRef);
      throw new EngineError("ContextExpired", "The invocation context has expired.");
    }
    if (grant.remainingOperations < 1) throw new EngineError("OperationBudgetExceeded", "The invocation context has exhausted its operation budget.");
    const required = input.requiredAuthority ?? "observe";
    if (AUTHORITY_RANK[required] > AUTHORITY_RANK[grant.authorityCeiling] || AUTHORITY_RANK[required] > AUTHORITY_RANK[workspace.authorityMode]) {
      throw new EngineError("AuthorityExceeded", "The requested operation exceeds the monotonic authority ceiling.");
    }
    grant.remainingOperations -= 1;
    try {
      return await input.host.invoke({ context_ref: input.contextRef, command: input.command, input: input.input });
    } catch (error) {
      throw new EngineError("ModuleHostFault", "The module host failed; the workspace remains unchanged.", {
        moduleId: input.moduleId,
        cause: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async createSnapshot(rootInput: string): Promise<CreatedSnapshot> {
    const root = resolve(rootInput);
    const inspection = await this.inspectWorkspace(root);
    const store = new WorkspaceStore(workspaceDatabasePath(root));
    try {
      store.initialize();
      const revisions = store.listRevisions();
      const eventLogPosition = store.eventLogPosition();
      const modules = await Promise.all(inspection.modules.map(async (module) => {
        const bundle = await readFile(join(moduleBundleDirectory(root, module), "module.json"));
        return { moduleId: module.moduleId, version: module.version, bundle, schema: JSON.parse(bundle.toString("utf8")) };
      }));
      return await createSnapshot(join(root, ".aimoto", "snapshots"), {
        workspaceId: inspection.workspaceId,
        workspaceRevision: inspection.revision,
        workspaceManifest: await readWorkspaceManifest(root),
        revisions,
        modules,
        data: {},
        context: await readContext(root),
        eventLogPosition,
        engineConfigurationRefs: []
      });
    } finally { store.close(); }
  }

  async listSnapshots(rootInput: string): Promise<readonly SnapshotSummary[]> {
    const root = resolve(rootInput);
    await this.inspectWorkspace(root);
    return listSnapshots(join(root, ".aimoto", "snapshots"));
  }

  async inspectSnapshot(rootInput: string, snapshotId: string): Promise<SnapshotVerification> {
    const root = resolve(rootInput);
    await this.inspectWorkspace(root);
    return verifySnapshot(join(root, ".aimoto", "snapshots"), snapshotId);
  }

  async planSnapshotRestore(rootInput: string, snapshotId: string): Promise<RestorePlan> {
    const root = resolve(rootInput);
    const workspace = await this.inspectWorkspace(root);
    return planRestore(join(root, ".aimoto", "snapshots"), snapshotId, workspace.revision);
  }
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
      modules: await builtInModulePins(),
      layout: {
        homeView: "tasks.list",
        views: [
          { id: "files.browser", moduleId: "aimoto.files", viewId: "browser" },
          { id: "files.detail", moduleId: "aimoto.files", viewId: "detail" },
          { id: "tasks.list", moduleId: "aimoto.tasks", viewId: "task-list" },
          { id: "tasks.form", moduleId: "aimoto.tasks", viewId: "task-form" }
        ]
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
        layout: fileManifest.layout,
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
