import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { WorkspaceManifest } from "@ai-mo-to/protocol";

interface RecordRow {
  module_id: string;
  collection_id: string;
  record_id: string;
  record_version: number;
  created_at: string;
  updated_at: string;
  data_json: string;
}

export interface StoredWorkspace {
  workspaceId: string;
  revision: number;
  createdAt: string;
  manifest: WorkspaceManifest;
}

export type ProposalStatus = "pending" | "rejected" | "stale" | "committed";

export interface StoredProposal {
  proposalId: string;
  changeSetHash: string;
  baseRevision: number;
  status: ProposalStatus;
  changeSet: unknown;
  createdAt: string;
}

export interface StoredRevision {
  revision: number;
  createdAt: string;
  reason: string;
  manifest: WorkspaceManifest;
}

export interface StoredApproval {
  approvalId: string;
  proposalId: string;
  changeSetHash: string;
  principalId: string;
  approvedAt: string;
}

export interface RecordHealth {
  status: "ok";
  totalRecords: number;
  totalEvents: number;
  collections: readonly {
    moduleId: string;
    collectionId: string;
    recordCount: number;
  }[];
}

/** A durable record owned by a module collection. `data` is always a JSON object. */
export interface StoredRecord<T extends Record<string, unknown> = Record<string, unknown>> {
  moduleId: string;
  collectionId: string;
  recordId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  data: T;
}

export interface StoredRecordEvent {
  sequence: number;
  occurredAt: string;
  moduleId: string;
  collectionId: string;
  recordId: string;
  eventType: string;
  recordVersion: number;
  payload: unknown;
}

export interface WorkspaceRecordSnapshot {
  schemaVersion: 1;
  records: readonly StoredRecord[];
  events: readonly StoredRecordEvent[];
}

export class RecordStoreError extends Error {
  constructor(readonly code: "RecordNotFound" | "RecordExists" | "VersionConflict" | "ValidationFailed", message: string) {
    super(message);
    this.name = "RecordStoreError";
  }
}

function assertRecordId(value: string): void {
  if (!value.trim() || value.length > 160) {
    throw new RecordStoreError("ValidationFailed", "A record id is required and must be at most 160 characters.");
  }
}

export class ProposalCommitError extends Error {
  constructor(readonly code: "ProposalNotFound" | "ApprovalRequired" | "ProposalStale" | "HashMismatch", message: string) {
    super(message);
    this.name = "ProposalCommitError";
  }
}

export const WORKSPACE_DIRECTORIES = [
  ".aimoto/versions"
] as const;

export function workspaceManifestPath(root: string): string {
  return join(root, ".aimoto", "workspace.json");
}

export function workspaceDatabasePath(root: string): string {
  return join(root, ".aimoto", "state.sqlite");
}

export async function initializeWorkspaceLayout(root: string): Promise<void> {
  await Promise.all(
    WORKSPACE_DIRECTORIES.map((directory) =>
      mkdir(join(root, directory), { recursive: true })
    )
  );
}

/** Creates only the metadata needed by a newly handed-off workspace. */
export async function createMinimalWorkspace(root: string, name: string): Promise<WorkspaceManifest> {
  const workspaceId = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(workspaceId)) {
    throw new Error("A workspace name must produce an id of 3 to 64 lowercase letters, numbers, or hyphens.");
  }
  const manifest: WorkspaceManifest = {
    schemaVersion: 2,
    workspaceId,
    name,
    createdAt: new Date().toISOString(),
    revision: 0,
    currentVersionId: null
  };
  await initializeWorkspaceLayout(root);
  await mkdir(join(root, ".aimoto"), { recursive: true });
  await writeWorkspaceManifest(root, manifest);
  const notesPath = join(root, ".aimoto", "notes.json");
  try {
    await readFile(notesPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeFile(notesPath, "[]\n", "utf8");
  }
  return manifest;
}

export async function writeWorkspaceManifest(
  root: string,
  manifest: WorkspaceManifest
): Promise<void> {
  const destination = workspaceManifestPath(root);
  const temporary = `${destination}.tmp`;
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(temporary, destination);
}

export async function readWorkspaceManifest(
  root: string
): Promise<WorkspaceManifest> {
  const content = await readFile(workspaceManifestPath(root), "utf8");
  return JSON.parse(content) as WorkspaceManifest;
}

export class WorkspaceStore {
  readonly #database: DatabaseSync;

  constructor(databasePath: string) {
    this.#database = new DatabaseSync(databasePath);
    this.#database.exec("PRAGMA foreign_keys = ON;");
    this.#database.exec("PRAGMA journal_mode = WAL;");
  }

  initialize(): void {
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS workspace_metadata (
        singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        workspace_id TEXT NOT NULL UNIQUE,
        revision INTEGER NOT NULL CHECK (revision >= 0),
        created_at TEXT NOT NULL,
        manifest_json TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS revision_log (
        revision INTEGER PRIMARY KEY CHECK (revision >= 0),
        created_at TEXT NOT NULL,
        reason TEXT NOT NULL,
        manifest_json TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS event_log (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        occurred_at TEXT NOT NULL,
        event_type TEXT NOT NULL,
        workspace_revision INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS proposals (
        proposal_id TEXT PRIMARY KEY,
        change_set_hash TEXT NOT NULL,
        base_revision INTEGER NOT NULL CHECK (base_revision >= 0),
        status TEXT NOT NULL CHECK (status IN ('pending', 'rejected', 'stale', 'committed')),
        change_set_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        committed_at TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS approval_records (
        approval_id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL REFERENCES proposals(proposal_id),
        change_set_hash TEXT NOT NULL,
        principal_id TEXT NOT NULL,
        approved_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS module_records (
        module_id TEXT NOT NULL,
        collection_id TEXT NOT NULL,
        record_id TEXT NOT NULL,
        record_version INTEGER NOT NULL CHECK (record_version >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        data_json TEXT NOT NULL,
        PRIMARY KEY (module_id, collection_id, record_id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS record_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        occurred_at TEXT NOT NULL,
        module_id TEXT NOT NULL,
        collection_id TEXT NOT NULL,
        record_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        record_version INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      ) STRICT;
    `);
  }

  createRecord<T extends Record<string, unknown>>(input: {
    moduleId: string;
    collectionId: string;
    recordId: string;
    data: T;
    now: string;
    validate?: (data: T) => void;
  }): StoredRecord<T> {
    assertRecordId(input.recordId);
    input.validate?.(input.data);
    this.#database.exec("BEGIN IMMEDIATE;");
    try {
      this.#database.prepare(`
        INSERT INTO module_records (module_id, collection_id, record_id, record_version, created_at, updated_at, data_json)
        VALUES (?, ?, ?, 1, ?, ?, ?)
      `).run(input.moduleId, input.collectionId, input.recordId, input.now, input.now, JSON.stringify(input.data));
      this.#recordEvent(input, "record.created", 1, input.data);
      this.#database.exec("COMMIT;");
    } catch (error) {
      this.#database.exec("ROLLBACK;");
      if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) {
        throw new RecordStoreError("RecordExists", `Record ${input.recordId} already exists in ${input.collectionId}.`);
      }
      throw error;
    }
    return { moduleId: input.moduleId, collectionId: input.collectionId, recordId: input.recordId, version: 1, createdAt: input.now, updatedAt: input.now, data: input.data };
  }

  getRecord<T extends Record<string, unknown>>(moduleId: string, collectionId: string, recordId: string): StoredRecord<T> | undefined {
    const row = this.#database.prepare(`
      SELECT module_id, collection_id, record_id, record_version, created_at, updated_at, data_json
      FROM module_records WHERE module_id = ? AND collection_id = ? AND record_id = ?
    `).get(moduleId, collectionId, recordId) as RecordRow | undefined;
    return row ? this.#toRecord<T>(row) : undefined;
  }

  listRecords<T extends Record<string, unknown>>(moduleId: string, collectionId: string): readonly StoredRecord<T>[] {
    const rows = this.#database.prepare(`
      SELECT module_id, collection_id, record_id, record_version, created_at, updated_at, data_json
      FROM module_records WHERE module_id = ? AND collection_id = ? ORDER BY updated_at DESC, record_id ASC
    `).all(moduleId, collectionId) as unknown as RecordRow[];
    return rows.map((row) => this.#toRecord<T>(row));
  }

  snapshotRecords(): WorkspaceRecordSnapshot {
    const rows = this.#database.prepare(`
      SELECT module_id, collection_id, record_id, record_version, created_at, updated_at, data_json
      FROM module_records ORDER BY module_id, collection_id, record_id
    `).all() as unknown as RecordRow[];
    const events = this.#database.prepare(`
      SELECT sequence, occurred_at, module_id, collection_id, record_id, event_type, record_version, payload_json
      FROM record_events ORDER BY sequence
    `).all() as unknown as Array<{
      sequence: number; occurred_at: string; module_id: string; collection_id: string;
      record_id: string; event_type: string; record_version: number; payload_json: string;
    }>;
    return {
      schemaVersion: 1,
      records: rows.map((row) => this.#toRecord(row)),
      events: events.map((event) => ({
        sequence: event.sequence, occurredAt: event.occurred_at, moduleId: event.module_id,
        collectionId: event.collection_id, recordId: event.record_id, eventType: event.event_type,
        recordVersion: event.record_version, payload: JSON.parse(event.payload_json) as unknown
      }))
    };
  }

  updateRecord<T extends Record<string, unknown>>(input: {
    moduleId: string;
    collectionId: string;
    recordId: string;
    expectedVersion: number;
    data: T;
    now: string;
    validate?: (data: T) => void;
  }): StoredRecord<T> {
    assertRecordId(input.recordId);
    input.validate?.(input.data);
    this.#database.exec("BEGIN IMMEDIATE;");
    try {
      const result = this.#database.prepare(`
        UPDATE module_records SET record_version = record_version + 1, updated_at = ?, data_json = ?
        WHERE module_id = ? AND collection_id = ? AND record_id = ? AND record_version = ?
      `).run(input.now, JSON.stringify(input.data), input.moduleId, input.collectionId, input.recordId, input.expectedVersion);
      if (result.changes !== 1) {
        if (!this.getRecord(input.moduleId, input.collectionId, input.recordId)) {
          throw new RecordStoreError("RecordNotFound", `Record ${input.recordId} does not exist in ${input.collectionId}.`);
        }
        throw new RecordStoreError("VersionConflict", `Record ${input.recordId} changed before this update could be saved.`);
      }
      const record = this.getRecord<T>(input.moduleId, input.collectionId, input.recordId)!;
      this.#recordEvent(input, "record.updated", record.version, input.data);
      this.#database.exec("COMMIT;");
      return record;
    } catch (error) {
      this.#database.exec("ROLLBACK;");
      throw error;
    }
  }

  deleteRecord(input: { moduleId: string; collectionId: string; recordId: string; expectedVersion: number; now: string }): void {
    this.#database.exec("BEGIN IMMEDIATE;");
    try {
      const existing = this.getRecord(input.moduleId, input.collectionId, input.recordId);
      if (!existing) throw new RecordStoreError("RecordNotFound", `Record ${input.recordId} does not exist in ${input.collectionId}.`);
      const result = this.#database.prepare(`
        DELETE FROM module_records WHERE module_id = ? AND collection_id = ? AND record_id = ? AND record_version = ?
      `).run(input.moduleId, input.collectionId, input.recordId, input.expectedVersion);
      if (result.changes !== 1) throw new RecordStoreError("VersionConflict", `Record ${input.recordId} changed before it could be removed.`);
      this.#recordEvent(input, "record.deleted", existing.version, existing.data);
      this.#database.exec("COMMIT;");
    } catch (error) {
      this.#database.exec("ROLLBACK;");
      throw error;
    }
  }

  #recordEvent(input: { moduleId: string; collectionId: string; recordId: string; now: string }, eventType: string, version: number, payload: unknown): void {
    this.#database.prepare(`
      INSERT INTO record_events (occurred_at, module_id, collection_id, record_id, event_type, record_version, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(input.now, input.moduleId, input.collectionId, input.recordId, eventType, version, JSON.stringify(payload));
  }

  #toRecord<T extends Record<string, unknown>>(row: RecordRow): StoredRecord<T> {
    return { moduleId: row.module_id, collectionId: row.collection_id, recordId: row.record_id, version: row.record_version, createdAt: row.created_at, updatedAt: row.updated_at, data: JSON.parse(row.data_json) as T };
  }

  create(manifest: WorkspaceManifest): void {
    this.#database.exec("BEGIN IMMEDIATE;");
    try {
      this.#database
        .prepare(`
          INSERT INTO workspace_metadata (
            singleton_id,
            workspace_id,
            revision,
            created_at,
            manifest_json
          ) VALUES (1, ?, ?, ?, ?)
        `)
        .run(
          manifest.workspaceId,
          manifest.revision,
          manifest.createdAt,
          JSON.stringify(manifest)
        );

      this.#database
        .prepare(`
          INSERT INTO revision_log (
            revision,
            created_at,
            reason,
            manifest_json
          ) VALUES (?, ?, ?, ?)
        `)
        .run(
          manifest.revision,
          manifest.createdAt,
          "workspace.created",
          JSON.stringify(manifest)
        );

      this.#database
        .prepare(`
          INSERT INTO event_log (
            occurred_at,
            event_type,
            workspace_revision,
            payload_json
          ) VALUES (?, ?, ?, ?)
        `)
        .run(
          manifest.createdAt,
          "workspace.created",
          manifest.revision,
          JSON.stringify({ workspaceId: manifest.workspaceId })
        );

      this.#database.exec("COMMIT;");
    } catch (error) {
      this.#database.exec("ROLLBACK;");
      throw error;
    }
  }

  inspect(): StoredWorkspace | undefined {
    const row = this.#database
      .prepare(`
        SELECT workspace_id, revision, created_at, manifest_json
        FROM workspace_metadata
        WHERE singleton_id = 1
      `)
      .get() as
      | {
          workspace_id: string;
          revision: number;
          created_at: string;
          manifest_json: string;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      workspaceId: row.workspace_id,
      revision: row.revision,
      createdAt: row.created_at,
      manifest: JSON.parse(row.manifest_json) as WorkspaceManifest
    };
  }

  stageProposal(proposal: StoredProposal): void {
    this.#database.prepare(`
      INSERT INTO proposals (
        proposal_id, change_set_hash, base_revision, status, change_set_json, created_at
      ) VALUES (?, ?, ?, 'pending', ?, ?)
    `).run(
      proposal.proposalId,
      proposal.changeSetHash,
      proposal.baseRevision,
      JSON.stringify(proposal.changeSet),
      proposal.createdAt
    );
  }

  getProposal(proposalId: string): StoredProposal | undefined {
    const row = this.#database.prepare(`
      SELECT proposal_id, change_set_hash, base_revision, status, change_set_json, created_at
      FROM proposals WHERE proposal_id = ?
    `).get(proposalId) as {
      proposal_id: string;
      change_set_hash: string;
      base_revision: number;
      status: ProposalStatus;
      change_set_json: string;
      created_at: string;
    } | undefined;

    return row ? {
      proposalId: row.proposal_id,
      changeSetHash: row.change_set_hash,
      baseRevision: row.base_revision,
      status: row.status,
      changeSet: JSON.parse(row.change_set_json) as unknown,
      createdAt: row.created_at
    } : undefined;
  }

  listRevisions(): readonly StoredRevision[] {
    const rows = this.#database.prepare(`
      SELECT revision, created_at, reason, manifest_json FROM revision_log ORDER BY revision ASC
    `).all() as { revision: number; created_at: string; reason: string; manifest_json: string }[];
    return rows.map((row) => ({
      revision: row.revision,
      createdAt: row.created_at,
      reason: row.reason,
      manifest: JSON.parse(row.manifest_json) as WorkspaceManifest
    }));
  }

  listProposals(): readonly StoredProposal[] {
    const rows = this.#database.prepare(`
      SELECT proposal_id, change_set_hash, base_revision, status, change_set_json, created_at
      FROM proposals ORDER BY created_at ASC, proposal_id ASC
    `).all() as {
      proposal_id: string; change_set_hash: string; base_revision: number;
      status: ProposalStatus; change_set_json: string; created_at: string;
    }[];
    return rows.map((row) => ({
      proposalId: row.proposal_id,
      changeSetHash: row.change_set_hash,
      baseRevision: row.base_revision,
      status: row.status,
      changeSet: JSON.parse(row.change_set_json) as unknown,
      createdAt: row.created_at
    }));
  }

  listApprovals(): readonly StoredApproval[] {
    const rows = this.#database.prepare(`
      SELECT approval_id, proposal_id, change_set_hash, principal_id, approved_at
      FROM approval_records ORDER BY approved_at ASC, approval_id ASC
    `).all() as {
      approval_id: string; proposal_id: string; change_set_hash: string;
      principal_id: string; approved_at: string;
    }[];
    return rows.map((row) => ({
      approvalId: row.approval_id,
      proposalId: row.proposal_id,
      changeSetHash: row.change_set_hash,
      principalId: row.principal_id,
      approvedAt: row.approved_at
    }));
  }

  inspectRecordHealth(): RecordHealth {
    const integrity = this.#database.prepare("PRAGMA quick_check").all() as { quick_check: string }[];
    if (integrity.some((row) => row.quick_check !== "ok")) {
      throw new Error("The workspace database failed its integrity check.");
    }
    const collections = this.#database.prepare(`
      SELECT module_id, collection_id, COUNT(*) AS record_count
      FROM module_records GROUP BY module_id, collection_id
      ORDER BY module_id ASC, collection_id ASC
    `).all() as { module_id: string; collection_id: string; record_count: number }[];
    const eventRow = this.#database.prepare("SELECT COUNT(*) AS count FROM record_events").get() as { count: number };
    return {
      status: "ok",
      totalRecords: collections.reduce((sum, row) => sum + row.record_count, 0),
      totalEvents: eventRow.count,
      collections: collections.map((row) => ({
        moduleId: row.module_id,
        collectionId: row.collection_id,
        recordCount: row.record_count
      }))
    };
  }

  eventLogPosition(): number {
    const row = this.#database.prepare("SELECT COALESCE(MAX(sequence), 0) AS position FROM event_log").get() as { position: number };
    return row.position;
  }

  commitProposal(input: {
    proposalId: string;
    expectedHash: string;
    approvalId: string;
    principalId: string;
    approvedAt: string;
    transformManifest: (current: WorkspaceManifest, changeSet: unknown) => WorkspaceManifest;
    transformRecords?: (snapshot: WorkspaceRecordSnapshot, changeSet: unknown) => WorkspaceRecordSnapshot | undefined;
  }): WorkspaceManifest {
    this.#database.exec("BEGIN IMMEDIATE;");
    try {
      const proposal = this.getProposal(input.proposalId);
      if (!proposal) {
        throw new ProposalCommitError("ProposalNotFound", "The proposal does not exist.");
      }
      if (proposal.status !== "pending") {
        throw new ProposalCommitError("ApprovalRequired", "The proposal is not pending approval.");
      }
      if (proposal.changeSetHash !== input.expectedHash) {
        throw new ProposalCommitError("HashMismatch", "The approval hash does not match the staged ChangeSet.");
      }

      const current = this.inspect();
      if (!current) {
        throw new ProposalCommitError("ProposalNotFound", "The workspace metadata does not exist.");
      }
      if (current.revision !== proposal.baseRevision) {
        this.#database.prepare("UPDATE proposals SET status = 'stale' WHERE proposal_id = ?").run(proposal.proposalId);
        throw new ProposalCommitError("ProposalStale", "The workspace revision changed after the proposal was staged.");
      }

      const nextManifest = input.transformManifest(current.manifest, proposal.changeSet);
      const nextRevision = current.revision + 1;
      const committedManifest = { ...nextManifest, revision: nextRevision };
      const replacement = input.transformRecords?.(this.snapshotRecords(), proposal.changeSet);
      if (replacement) this.#replaceRecords(replacement, input.approvedAt, nextRevision);

      this.#database.prepare(`
        UPDATE workspace_metadata SET revision = ?, manifest_json = ? WHERE singleton_id = 1 AND revision = ?
      `).run(nextRevision, JSON.stringify(committedManifest), current.revision);
      this.#database.prepare(`
        INSERT INTO revision_log (revision, created_at, reason, manifest_json) VALUES (?, ?, ?, ?)
      `).run(nextRevision, input.approvedAt, "proposal.committed", JSON.stringify(committedManifest));
      this.#database.prepare(`
        INSERT INTO approval_records (approval_id, proposal_id, change_set_hash, principal_id, approved_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(input.approvalId, proposal.proposalId, input.expectedHash, input.principalId, input.approvedAt);
      this.#database.prepare(`
        UPDATE proposals SET status = 'committed', committed_at = ? WHERE proposal_id = ?
      `).run(input.approvedAt, proposal.proposalId);
      this.#database.prepare(`
        INSERT INTO event_log (occurred_at, event_type, workspace_revision, payload_json) VALUES (?, ?, ?, ?)
      `).run(input.approvedAt, "proposal.committed", nextRevision, JSON.stringify({ proposalId: proposal.proposalId, changeSetHash: input.expectedHash }));
      this.#database.exec("COMMIT;");
      return committedManifest;
    } catch (error) {
      this.#database.exec("ROLLBACK;");
      throw error;
    }
  }

  #replaceRecords(snapshot: WorkspaceRecordSnapshot, occurredAt: string, workspaceRevision: number): void {
    if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.records) || !Array.isArray(snapshot.events)) {
      throw new RecordStoreError("ValidationFailed", "The snapshot record payload is invalid.");
    }
    const keys = new Set<string>();
    for (const record of snapshot.records) {
      assertRecordId(record.recordId);
      if (!record.moduleId || !record.collectionId || !Number.isSafeInteger(record.version) || record.version < 1 ||
          !record.createdAt || !record.updatedAt || !record.data || typeof record.data !== "object" || Array.isArray(record.data)) {
        throw new RecordStoreError("ValidationFailed", "A captured module record is invalid.");
      }
      const key = `${record.moduleId}\0${record.collectionId}\0${record.recordId}`;
      if (keys.has(key)) throw new RecordStoreError("ValidationFailed", `Duplicate captured record: ${record.recordId}.`);
      keys.add(key);
    }
    this.#database.prepare("DELETE FROM module_records").run();
    const insert = this.#database.prepare(`
      INSERT INTO module_records (module_id, collection_id, record_id, record_version, created_at, updated_at, data_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const record of snapshot.records) {
      insert.run(record.moduleId, record.collectionId, record.recordId, record.version, record.createdAt, record.updatedAt, JSON.stringify(record.data));
      this.#database.prepare(`
        INSERT INTO record_events (occurred_at, module_id, collection_id, record_id, event_type, record_version, payload_json)
        VALUES (?, ?, ?, ?, 'record.restored', ?, ?)
      `).run(occurredAt, record.moduleId, record.collectionId, record.recordId, record.version,
        JSON.stringify({ snapshotVersion: record.version, workspaceRevision }));
    }
  }

  close(): void {
    this.#database.close();
  }
}
