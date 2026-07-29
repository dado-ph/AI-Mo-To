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
  | "ModuleNotInstalled"
  | "ModuleHostFault"
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
