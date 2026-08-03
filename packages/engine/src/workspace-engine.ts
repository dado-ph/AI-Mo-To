import { access, cp, readdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
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
  RecordStoreError,
  WorkspaceStore,
  initializeWorkspaceLayout,
  readWorkspaceManifest,
  workspaceDatabasePath,
  workspaceManifestPath,
  writeWorkspaceManifest,
  type StoredRecord,
  type WorkspaceRecordSnapshot
} from "@ai-mo-to/storage";
import {
  createSnapshot,
  listSnapshots,
  planRestore,
  readVerifiedWorkspaceManifest,
  readVerifiedSnapshotData,
  verifySnapshot,
  type CreatedSnapshot,
  type RestorePlan,
  type SnapshotSummary,
  type SnapshotVerification
} from "@ai-mo-to/snapshot";

import { EngineError } from "./errors.js";
import { AuthorityStateGuard } from "./authority-guard.js";

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
  /** Every named capability must be explicitly granted in the workspace manifest. */
  requiredCapabilities?: readonly string[];
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
  capabilities: WorkspaceManifest["capabilities"];
  layout: WorkspaceManifest["layout"];
  health: "ok";
  evidence: {
    revisions: readonly {
      revision: number;
      createdAt: string;
      reason: string;
    }[];
    proposals: readonly {
      proposalId: string;
      baseRevision: number;
      changeSetDigest: string;
      status: string;
      createdAt: string;
      appliedRevision?: number;
    }[];
    approvals: readonly {
      approvalId: string;
      proposalId: string;
      changeSetDigest: string;
      principalId: string;
      approvedAt: string;
    }[];
    recordHealth: {
      status: "ok";
      totalRecords: number;
      totalEvents: number;
      collections: readonly {
        moduleId: string;
        collectionId: string;
        recordCount: number;
      }[];
    };
  };
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

export interface CreateSnapshotRestoreProposalInput {
  root: string;
  snapshotId: string;
  proposalId: string;
  now?: () => Date;
}

export interface ExecuteBuiltInCommandInput {
  root: string;
  moduleId: "aimoto.files" | "aimoto.tasks";
  command: string;
  input: Record<string, unknown>;
  now?: () => Date;
}

type BuiltInRecord = StoredRecord<Record<string, unknown>>;
export interface InstalledModuleView {
  moduleId: string;
  id: string;
  title: string;
  kind: "form" | "list" | "table" | "detail" | "timeline" | "app";
  collection: string;
  /** Sandboxed, installed HTML entrypoint for a generated application view. */
  entryUrl?: string;
}

export interface ExecuteHabitTrackerCommandInput {
  root: string;
  command: "create-habit" | "log-completion";
  input: Record<string, unknown>;
  now?: () => Date;
}

function requiredString(input: Record<string, unknown>, key: string, maxLength = 10_000): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new EngineError("ValidationFailed", `${key} must be a non-empty string of at most ${maxLength} characters.`);
  }
  return value;
}

function requiredVersion(input: Record<string, unknown>): number {
  const value = input.expectedVersion;
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new EngineError("ValidationFailed", "expectedVersion must be a positive integer.");
  }
  return value as number;
}

function optionalDateTime(value: unknown, key: string): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new EngineError("ValidationFailed", `${key} must be an ISO date-time or null.`);
  }
  return value;
}

function validateTask(data: Record<string, unknown>): void {
  requiredString(data, "taskId", 160);
  requiredString(data, "title", 240);
  if (data.notes !== undefined && (typeof data.notes !== "string" || data.notes.length > 10_000)) {
    throw new EngineError("ValidationFailed", "notes must be a string of at most 10000 characters.");
  }
  if (!["open", "in-progress", "done"].includes(data.status as string)) {
    throw new EngineError("ValidationFailed", "status must be open, in-progress, or done.");
  }
  optionalDateTime(data.dueAt, "dueAt");
  optionalDateTime(data.createdAt, "createdAt");
  optionalDateTime(data.updatedAt, "updatedAt");
  if (!Number.isInteger(data.version) || (data.version as number) < 1) {
    throw new EngineError("ValidationFailed", "version must be a positive integer.");
  }
}

function validateFile(data: Record<string, unknown>): void {
  requiredString(data, "fileId", 160);
  requiredString(data, "name");
  const relativePath = requiredString(data, "relativePath");
  if (/^(?:\/|[A-Za-z]:)|(?:^|[\\/])\.\.(?:[\\/]|$)/.test(relativePath)) {
    throw new EngineError("ValidationFailed", "relativePath must remain inside the workspace.");
  }
  if (!["file", "folder"].includes(data.kind as string)) {
    throw new EngineError("ValidationFailed", "kind must be file or folder.");
  }
  if (data.size !== undefined && (!Number.isInteger(data.size) || (data.size as number) < 0)) {
    throw new EngineError("ValidationFailed", "size must be a non-negative integer.");
  }
  optionalDateTime(data.updatedAt, "updatedAt");
}

function mapRecordError(error: unknown): never {
  if (error instanceof EngineError) throw error;
  if (error instanceof RecordStoreError) {
    throw new EngineError(error.code, error.message);
  }
  throw error;
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

function builtInModulesRoot(): string {
  // The installed desktop app supplies this directory from its packaged
  // resources; source and CLI builds retain the repository-relative default.
  return process.env.AIMOTO_BUILTIN_MODULES_DIR ?? join(fileURLToPath(new URL("../../../", import.meta.url)), "modules");
}

async function builtInModulePins(): Promise<WorkspaceManifest["modules"]> {
  const modulesRoot = builtInModulesRoot();
  return Promise.all(["files", "tasks"].map(async (name) => {
    const directory = join(modulesRoot, name);
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
    return join(builtInModulesRoot(), name);
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

function applyOperations(
  current: WorkspaceManifest,
  changeSet: ChangeSet,
  restoredManifests = new Map<string, WorkspaceManifest>(),
): WorkspaceManifest {
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
      // A generated application may define its own workspace surface.  The
      // module remains the durable artifact, while this optional layout is the
      // reviewed workspace composition that the agent proposed.  Keep the
      // trust substrate in the host manifest; only navigation/views are
      // replaceable by generated workspaces.
      const candidateLayout = operation.input.workspaceLayout;
      if (candidateLayout && typeof candidateLayout === "object") {
        const layout = candidateLayout as { homeView?: unknown; views?: unknown };
        if (typeof layout.homeView !== "string" || !Array.isArray(layout.views)) {
          throw new EngineError("ValidationFailed", "Generated workspace layout must define homeView and views.");
        }
        const views = layout.views.filter((view): view is { id: string; moduleId: string; viewId: string } =>
          Boolean(view && typeof view === "object" && typeof (view as any).id === "string" && typeof (view as any).moduleId === "string" && typeof (view as any).viewId === "string"));
        if (views.length !== layout.views.length || views.length === 0) {
          throw new EngineError("ValidationFailed", "Generated workspace layout contains invalid views.");
        }
        if (!views.some((view) => view.id === layout.homeView)) {
          throw new EngineError("ValidationFailed", "Generated workspace homeView must reference a declared view.");
        }
        next = { ...next, layout: { homeView: layout.homeView, views } };
      }
      continue;
    }

    if (operation.kind === "workspace.restore-snapshot") {
      const restored = restoredManifests.get(operation.operationId);
      if (!restored) {
        throw new EngineError("ValidationFailed", "The restore operation was not verified before approval.");
      }
      if (restored.workspaceId !== current.workspaceId) {
        throw new EngineError("ValidationFailed", "The snapshot belongs to a different workspace.");
      }
      // Keep the local identity stable. WorkspaceStore assigns the new revision
      // inside the same approval transaction, preserving every old revision.
      next = { ...restored, workspaceId: current.workspaceId, createdAt: current.createdAt };
      continue;
    }

    throw new EngineError("ValidationFailed", `Unsupported ChangeSet operation: ${operation.kind}.`);
  }
  return next;
}

async function verifiedRestoreManifests(root: string, changeSet: ChangeSet): Promise<Map<string, WorkspaceManifest>> {
  const resolved = new Map<string, WorkspaceManifest>();
  for (const operation of changeSet.operations) {
    if (operation.kind !== "workspace.restore-snapshot") continue;
    const snapshotId = operation.input.snapshotId;
    const manifestDigest = operation.input.workspaceManifestDigest;
    if (typeof snapshotId !== "string" || typeof manifestDigest !== "string") {
      throw new EngineError("ValidationFailed", "A restore operation must name its snapshot and captured manifest digest.");
    }
    const restored = await readVerifiedWorkspaceManifest(join(root, ".aimoto", "snapshots"), snapshotId);
    if (restored.manifestDigest !== manifestDigest) {
      throw new EngineError("ValidationFailed", "The snapshot no longer contains the manifest bound to this restore proposal.");
    }
    assertManifest(restored.manifest);
    resolved.set(operation.operationId, restored.manifest);
  }
  return resolved;
}

interface VerifiedRestoreState {
  manifest: WorkspaceManifest;
  records: WorkspaceRecordSnapshot;
}

async function verifiedRestoreStates(root: string, changeSet: ChangeSet): Promise<Map<string, VerifiedRestoreState>> {
  const manifests = await verifiedRestoreManifests(root, changeSet);
  const states = new Map<string, VerifiedRestoreState>();
  for (const operation of changeSet.operations) {
    if (operation.kind !== "workspace.restore-snapshot") continue;
    const snapshotId = operation.input.snapshotId;
    const dataDigest = operation.input.dataDigest;
    if (typeof snapshotId !== "string" || typeof dataDigest !== "string") {
      throw new EngineError("ValidationFailed", "A restore operation must bind the captured record data digest.");
    }
    const verified = await readVerifiedSnapshotData(join(root, ".aimoto", "snapshots"), snapshotId);
    if (verified.dataDigest !== dataDigest) {
      throw new EngineError("ValidationFailed", "The snapshot no longer contains the record data bound to this restore proposal.");
    }
    const manifest = manifests.get(operation.operationId)!;
    const records = verified.data as WorkspaceRecordSnapshot;
    if (records?.schemaVersion !== 1 || !Array.isArray(records.records) || !Array.isArray(records.events)) {
      throw new EngineError("ValidationFailed", "The snapshot contains an invalid record collection payload.");
    }
    const pins = new Map(manifest.modules.map((module) => [module.moduleId, module.version]));
    const snapshotModules = new Map(verified.snapshot.modules.map((module) => [module.moduleId, module.version]));
    for (const module of verified.snapshot.modules) {
      const schemaBytes = await readFile(join(root, ".aimoto", "snapshots", "objects", module.schema.digest));
      const declaration = JSON.parse(schemaBytes.toString("utf8")) as { moduleId?: unknown; version?: unknown };
      if (declaration.moduleId !== module.moduleId || declaration.version !== module.version) {
        throw new EngineError("ValidationFailed", `Snapshot module declaration is inconsistent for ${module.moduleId}.`);
      }
    }
    if (pins.size !== snapshotModules.size ||
        [...pins].some(([moduleId, version]) => snapshotModules.get(moduleId) !== version) ||
        records.records.some((record) => pins.get(record.moduleId) === undefined)) {
      throw new EngineError("ValidationFailed", "Snapshot records, module bundles, and the captured workspace manifest are inconsistent.");
    }
    states.set(operation.operationId, { manifest, records });
  }
  return states;
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
    const granted = new Set(workspace.capabilities.map((grant) => grant.capability));
    const denied = (input.requiredCapabilities ?? []).filter((capability) => !granted.has(capability));
    if (denied.length > 0) {
      throw new EngineError("CapabilityDenied", "The requested operation requires a capability that this workspace has not granted.", { denied });
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

  /**
   * Executes the core Files and Tasks contracts through engine-owned storage.
   * The engine derives timestamps, lifecycle fields, and record versions so a
   * module cannot forge concurrency metadata.
   */
  async executeBuiltInCommand(input: ExecuteBuiltInCommandInput): Promise<BuiltInRecord | { removed: true; recordId: string }> {
    const root = resolve(input.root);
    const workspace = await this.inspectWorkspace(root);
    AuthorityStateGuard.assertCanMutateState(workspace.authorityMode, "executeBuiltInCommand");
    if (!workspace.modules.some((module) => module.moduleId === input.moduleId)) {
      throw new EngineError("ModuleNotInstalled", `Module ${input.moduleId} is not installed in this workspace.`);
    }
    const now = (input.now ?? (() => new Date()))().toISOString();
    const store = new WorkspaceStore(workspaceDatabasePath(root));
    try {
      store.initialize();
      if (input.moduleId === "aimoto.files") {
        if (input.command === "register") {
          const recordId = requiredString(input.input, "fileId", 160);
          const data: Record<string, unknown> = {
            fileId: recordId,
            name: requiredString(input.input, "name"),
            relativePath: requiredString(input.input, "relativePath"),
            kind: input.input.kind,
            ...(input.input.size === undefined ? {} : { size: input.input.size }),
            updatedAt: now
          };
          return store.createRecord({
            moduleId: input.moduleId, collectionId: "file", recordId, data, now, validate: validateFile
          });
        }
        if (input.command === "remove") {
          const recordId = requiredString(input.input, "fileId", 160);
          store.deleteRecord({
            moduleId: input.moduleId, collectionId: "file", recordId,
            expectedVersion: requiredVersion(input.input), now
          });
          return { removed: true, recordId };
        }
      }

      if (input.moduleId === "aimoto.tasks") {
        if (input.command === "create") {
          const recordId = requiredString(input.input, "taskId", 160);
          const data: Record<string, unknown> = {
            taskId: recordId,
            title: requiredString(input.input, "title", 240),
            ...(input.input.notes === undefined ? {} : { notes: input.input.notes }),
            status: "open",
            dueAt: optionalDateTime(input.input.dueAt, "dueAt") ?? null,
            createdAt: now,
            updatedAt: now,
            version: 1
          };
          return store.createRecord({
            moduleId: input.moduleId, collectionId: "task", recordId, data, now, validate: validateTask
          });
        }

        if (["update", "complete", "reopen"].includes(input.command)) {
          const recordId = requiredString(input.input, "taskId", 160);
          const expectedVersion = requiredVersion(input.input);
          const existing = store.getRecord<Record<string, unknown>>(input.moduleId, "task", recordId);
          if (!existing) throw new EngineError("RecordNotFound", `Record ${recordId} does not exist in task.`);
          const data = { ...existing.data };
          if (input.command === "update") {
            if (input.input.title !== undefined) data.title = requiredString(input.input, "title", 240);
            if (input.input.notes !== undefined) data.notes = input.input.notes;
            if (Object.hasOwn(input.input, "dueAt")) data.dueAt = optionalDateTime(input.input.dueAt, "dueAt") ?? null;
            if (input.input.status !== undefined) data.status = input.input.status;
          } else {
            data.status = input.command === "complete" ? "done" : "open";
          }
          data.updatedAt = now;
          data.version = expectedVersion + 1;
          return store.updateRecord({
            moduleId: input.moduleId, collectionId: "task", recordId, expectedVersion, data, now, validate: validateTask
          });
        }
      }
      throw new EngineError("CommandNotFound", `Command ${input.command} is not declared by ${input.moduleId}.`);
    } catch (error) {
      mapRecordError(error);
    } finally {
      store.close();
    }
  }

  async getBuiltInRecord(rootInput: string, moduleId: "aimoto.files" | "aimoto.tasks", recordId: string): Promise<BuiltInRecord> {
    const root = resolve(rootInput);
    const workspace = await this.inspectWorkspace(root);
    if (!workspace.modules.some((module) => module.moduleId === moduleId)) {
      throw new EngineError("ModuleNotInstalled", `Module ${moduleId} is not installed in this workspace.`);
    }
    const collectionId = moduleId === "aimoto.files" ? "file" : "task";
    const store = new WorkspaceStore(workspaceDatabasePath(root));
    try {
      store.initialize();
      const record = store.getRecord(moduleId, collectionId, recordId);
      if (!record) throw new EngineError("RecordNotFound", `Record ${recordId} does not exist in ${collectionId}.`);
      return record;
    } finally {
      store.close();
    }
  }

  async listBuiltInRecords(rootInput: string, moduleId: "aimoto.files" | "aimoto.tasks"): Promise<readonly BuiltInRecord[]> {
    const root = resolve(rootInput);
    const workspace = await this.inspectWorkspace(root);
    if (!workspace.modules.some((module) => module.moduleId === moduleId)) {
      throw new EngineError("ModuleNotInstalled", `Module ${moduleId} is not installed in this workspace.`);
    }
    const collectionId = moduleId === "aimoto.files" ? "file" : "task";
    const store = new WorkspaceStore(workspaceDatabasePath(root));
    try {
      store.initialize();
      return store.listRecords(moduleId, collectionId);
    } finally {
      store.close();
    }
  }

  /** Reads inert, validated view declarations from an installed module bundle. Generated code is never loaded. */
  async listInstalledModuleViews(rootInput: string, moduleId: string): Promise<readonly InstalledModuleView[]> {
    const root = resolve(rootInput);
    const workspace = await this.inspectWorkspace(root);
    const pin = workspace.modules.find((module) => module.moduleId === moduleId);
    if (!pin) throw new EngineError("ModuleNotInstalled", `Module ${moduleId} is not installed in this workspace.`);
    const directory = moduleBundleDirectory(root, pin);
    const manifest = JSON.parse(await readFile(join(directory, "module.json"), "utf8")) as {
      moduleId?: unknown;
      views?: Array<{ id?: unknown; kind?: unknown; declaration?: unknown }>;
    };
    const validation = validateProtocol("module-manifest", manifest);
    if (!validation.valid || manifest.moduleId !== moduleId) {
      throw new EngineError("ValidationFailed", `Module ${moduleId} has an invalid manifest.`);
    }
    return Promise.all((manifest.views ?? []).map(async (view) => {
      if (typeof view.id !== "string" || typeof view.kind !== "string" || typeof view.declaration !== "string") {
        throw new EngineError("ValidationFailed", `Module ${moduleId} has an incomplete view declaration.`);
      }
      const declarationPath = resolve(directory, view.declaration);
      if (declarationPath !== directory && !declarationPath.startsWith(`${directory}\\`) && !declarationPath.startsWith(`${directory}/`)) {
        throw new EngineError("ValidationFailed", "A module view declaration escaped its installed bundle.");
      }
      const declaration = JSON.parse(await readFile(declarationPath, "utf8")) as {
        title?: unknown;
        kind?: unknown;
        collection?: unknown;
        entry?: unknown;
        root?: { bind?: unknown };
      };
      const collection = typeof declaration.collection === "string"
        ? declaration.collection
        : typeof declaration.root?.bind === "string" && declaration.root.bind.startsWith("collections.")
          ? declaration.root.bind.replace(/^collections\./, "")
          : "default";
      if (typeof declaration.title !== "string" || declaration.kind !== view.kind) {
        throw new EngineError("ValidationFailed", `Module ${moduleId} view ${view.id} is invalid.`);
      }
      let entryUrl: string | undefined;
      if (view.kind === "app") {
        if (typeof declaration.entry !== "string") {
          throw new EngineError("ValidationFailed", `Module ${moduleId} app view ${view.id} has no HTML entrypoint.`);
        }
        const entryPath = resolve(directory, declaration.entry);
        if (
          extname(entryPath).toLowerCase() !== ".html" ||
          (entryPath !== directory && !entryPath.startsWith(`${directory}\\`) && !entryPath.startsWith(`${directory}/`))
        ) {
          throw new EngineError("ValidationFailed", `Module ${moduleId} app view ${view.id} has an invalid entrypoint.`);
        }
        await access(entryPath);
        entryUrl = pathToFileURL(entryPath).href;
      }
      return {
        moduleId,
        id: view.id,
        title: declaration.title,
        kind: view.kind as InstalledModuleView["kind"],
        collection,
        ...(entryUrl ? { entryUrl } : {})
      };
    }));
  }

  async listInstalledModuleRecords(rootInput: string, moduleId: string, collectionId: string): Promise<readonly BuiltInRecord[]> {
    const root = resolve(rootInput);
    const workspace = await this.inspectWorkspace(root);
    if (!workspace.modules.some((module) => module.moduleId === moduleId)) {
      throw new EngineError("ModuleNotInstalled", `Module ${moduleId} is not installed in this workspace.`);
    }
    const store = new WorkspaceStore(workspaceDatabasePath(root));
    try {
      store.initialize();
      return store.listRecords(moduleId, collectionId);
    } finally { store.close(); }
  }

  async executeModuleRecordCommand(input: {
    root: string;
    moduleId: string;
    collectionId: string;
    recordId: string;
    data: Record<string, unknown>;
    now?: () => Date;
  }): Promise<BuiltInRecord> {
    const root = resolve(input.root);
    const workspace = await this.inspectWorkspace(root);
    AuthorityStateGuard.assertCanMutateState(workspace.authorityMode, "executeModuleRecordCommand");
    const now = (input.now ?? (() => new Date()))().toISOString();
    const store = new WorkspaceStore(workspaceDatabasePath(root));
    try {
      store.initialize();
      return store.createRecord({
        moduleId: input.moduleId,
        collectionId: input.collectionId,
        recordId: input.recordId,
        data: input.data,
        now
      });
    } catch (error) {
      mapRecordError(error);
    } finally { store.close(); }
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
        data: store.snapshotRecords(),
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

  /** Stages a restore as an ordinary, exact-digest ChangeSet. It does not mutate the workspace. */
  async createSnapshotRestoreProposal(input: CreateSnapshotRestoreProposalInput): Promise<ProposalRecord> {
    const root = resolve(input.root);
    const workspace = await this.inspectWorkspace(root);
    const restore = await this.planSnapshotRestore(root, input.snapshotId);
    if (restore.workspaceId !== workspace.workspaceId) {
      throw new EngineError("ValidationFailed", "The snapshot belongs to a different workspace.");
    }
    const changeSet: ChangeSet = {
      schemaVersion: SCHEMA_VERSION,
      changeSetId: randomUUID(),
      workspaceId: workspace.workspaceId,
      baseRevision: workspace.revision,
      createdAt: (input.now ?? (() => new Date()))().toISOString(),
      operations: [{
        operationId: "workspace-restore-snapshot",
        kind: "workspace.restore-snapshot",
        input: {
          snapshotId: input.snapshotId,
          workspaceManifestDigest: restore.manifest.workspaceManifest.digest,
          sourceRevision: restore.sourceRevision,
          dataDigest: restore.manifest.data.digest,
        },
        preconditions: [
          { kind: "workspace.revision", value: workspace.revision },
          { kind: "snapshot.manifest-digest", value: input.snapshotId },
        ],
        effects: ["workspace.restore"],
        reversibility: "compensatable",
      }],
    };
    return this.createProposal({
      root,
      changeSet,
      proposalId: input.proposalId,
      ...(input.now ? { now: input.now } : {}),
    });
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
        capabilities: fileManifest.capabilities,
        layout: fileManifest.layout,
        health: "ok",
        evidence: {
          revisions: store.listRevisions().map(({ revision, createdAt, reason }) => ({
            revision, createdAt, reason
          })),
          proposals: store.listProposals().map((proposal) => ({
            proposalId: proposal.proposalId,
            baseRevision: proposal.baseRevision,
            changeSetDigest: proposal.changeSetHash,
            status: proposal.status,
            createdAt: proposal.createdAt,
            ...(proposal.status === "committed"
              ? { appliedRevision: proposal.baseRevision + 1 }
              : {})
          })),
          approvals: store.listApprovals().map((approval) => ({
            approvalId: approval.approvalId,
            proposalId: approval.proposalId,
            changeSetDigest: approval.changeSetHash,
            principalId: approval.principalId,
            approvedAt: approval.approvedAt
          })),
          recordHealth: store.inspectRecordHealth()
        }
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
    const inspection = await this.inspectWorkspace(root);
    AuthorityStateGuard.assertCanApplyProposal(inspection.authorityMode);
    assertApproval(input.approval);

    // Atomic pre-apply snapshot guarantee before making workspace mutations
    await this.createSnapshot(root);

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
      const restoreStates = await verifiedRestoreStates(root, changeSet);
      const restoreManifests = new Map([...restoreStates].map(([operationId, state]) => [operationId, state.manifest]));

      let manifest: WorkspaceManifest;
      try {
        manifest = store.commitProposal({
          proposalId: input.approval.proposalId,
          expectedHash: input.approval.changeSetDigest,
          approvalId: input.approval.approvalId,
          principalId: input.approval.approvedBy ?? "local-user",
          approvedAt: input.approval.approvedAt,
          transformManifest: (current, stagedChangeSet) => applyOperations(current, stagedChangeSet as ChangeSet, restoreManifests),
          transformRecords: (_current, stagedChangeSet) => {
            for (const operation of (stagedChangeSet as ChangeSet).operations) {
              const restored = restoreStates.get(operation.operationId);
              if (restored) return restored.records;
            }
            return undefined;
          }
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
