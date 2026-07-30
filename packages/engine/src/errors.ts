export type EngineErrorCode =
  | "InvalidInput"
  | "WorkspaceNotFound"
  | "ProposalNotFound"
  | "ProposalStale"
  | "ApprovalRequired"
  | "ValidationFailed"
  | "ContextNotFound"
  | "ContextMismatch"
  | "ContextExpired"
  | "OperationBudgetExceeded"
  | "AuthorityExceeded"
  | "CapabilityDenied"
  | "ModuleNotInstalled"
  | "CommandNotFound"
  | "RecordNotFound"
  | "RecordExists"
  | "VersionConflict"
  | "ModuleHostFault"
  | "ResourceNotFound"
  | "FilesystemAccessDenied"
  | "ResourceBusy"
  | "SchemaInvalid"
  | "BootstrapFailed"
  | "InternalError";

export class EngineError extends Error {
  constructor(
    readonly code: EngineErrorCode,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "EngineError";
  }
}
