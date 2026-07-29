import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { WorkspaceManifest } from "@ai-mo-to/protocol";

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

export class ProposalCommitError extends Error {
  constructor(readonly code: "ProposalNotFound" | "ApprovalRequired" | "ProposalStale" | "HashMismatch", message: string) {
    super(message);
    this.name = "ProposalCommitError";
  }
}

export const WORKSPACE_DIRECTORIES = [
  ".aimoto/context",
  ".aimoto/modules/local",
  ".aimoto/snapshots",
  "files",
  "exports"
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
    `);
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

  close(): void {
    this.#database.close();
  }
}
