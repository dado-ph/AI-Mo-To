export const SCHEMA_VERSION = "1.0.0" as const;
export const JSON_ENVELOPE_VERSION = "1.0.0" as const;

export type Sha256Digest = `sha256:${string}`;

export type AuthorityMode =
  | "observe"
  | "suggest"
  | "assist"
  | "execute"
  | "build";

export interface ModulePin {
  moduleId: string;
  version: string;
  digest: Sha256Digest;
  source: {
    kind: "builtin" | "local" | "verified-community" | "community";
    reference: string;
  };
}

export interface EventRoute {
  source: {
    moduleId: string;
    event: string;
  };
  target: {
    moduleId: string;
    command: string;
  };
  maxCausalDepth: number;
  maxRouteDepth: number;
}

export interface WorkspaceManifest {
  schemaVersion: typeof SCHEMA_VERSION;
  workspaceId: string;
  name: string;
  createdAt: string;
  revision: number;
  modules: ModulePin[];
  layout: {
    homeView: string;
    views: Array<{
      id: string;
      moduleId: string;
      viewId: string;
    }>;
  };
  capabilities: Array<{
    capability: string;
    grantId: string;
  }>;
  eventRoutes: EventRoute[];
  aiAdapter: string;
  authorityMode: AuthorityMode;
  contextPolicy: string;
  snapshotPolicy: string;
}

export type EffectReversibility =
  | "transactional"
  | "reversible"
  | "compensatable"
  | "irreversible";

export interface ChangeOperation {
  operationId: string;
  kind: string;
  input: Record<string, unknown>;
  preconditions: Array<{
    kind: string;
    value: unknown;
  }>;
  effects: string[];
  reversibility: EffectReversibility;
}

export interface ChangeSet {
  schemaVersion: typeof SCHEMA_VERSION;
  changeSetId: string;
  workspaceId: string;
  baseRevision: number;
  createdAt: string;
  operations: ChangeOperation[];
}

/** A durable proposal binds one exact ChangeSet to the revision it was based on. */
export interface ProposalRecord {
  schemaVersion: typeof SCHEMA_VERSION;
  proposalId: string;
  workspaceId: string;
  baseRevision: number;
  changeSet: ChangeSet;
  changeSetDigest: Sha256Digest;
  status: "pending" | "approved" | "rejected" | "applied" | "stale";
  createdAt: string;
}

/** An approval is intentionally bound to the proposal identity, revision, and bytes. */
export interface ApprovalRecord {
  schemaVersion: typeof SCHEMA_VERSION;
  approvalId: string;
  proposalId: string;
  workspaceId: string;
  baseRevision: number;
  changeSetDigest: Sha256Digest;
  approvedAt: string;
  approvedBy?: string;
}

export const CHANGESET_APPROVAL_ERROR_CODES = [
  "ProposalNotFound",
  "ProposalStale",
  "ProposalRejected",
  "ApprovalRequired",
  "ApprovalDigestMismatch",
  "ApprovalAlreadyConsumed",
  "ChangeSetDigestMismatch",
  "ChangeSetInvalid",
  "ValidationFailed",
  "BaseRevisionStale"
] as const;

export type ChangeSetApprovalErrorCode =
  (typeof CHANGESET_APPROVAL_ERROR_CODES)[number];

export interface JsonEnvelope<T> {
  envelopeVersion: typeof JSON_ENVELOPE_VERSION;
  ok: boolean;
  command: string;
  traceId: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
