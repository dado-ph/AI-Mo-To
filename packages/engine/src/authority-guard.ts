import type { AuthorityMode } from "@ai-mo-to/protocol";

export class AuthorityViolationError extends Error {
  readonly code = "AuthorityViolation";
  constructor(
    public readonly mode: AuthorityMode,
    public readonly operation: string,
    message?: string
  ) {
    super(
      message ??
        `Operation '${operation}' is not permitted under authority mode '${mode}'.`
    );
    this.name = "AuthorityViolationError";
  }
}

/** Authority hierarchy level mapping for numeric comparison. */
const AUTHORITY_LEVELS: Record<AuthorityMode, number> = {
  observe: 0,
  suggest: 1,
  assist: 2,
  execute: 3,
  build: 4
};

/**
 * Enforces authority bounds for operations attempted against a workspace.
 */
export class AuthorityStateGuard {
  /**
   * Asserts that the active authority mode meets or exceeds the required mode for an operation.
   */
  static assertAuthority(
    activeMode: AuthorityMode,
    requiredMode: AuthorityMode,
    operationName: string
  ): void {
    const activeLevel = AUTHORITY_LEVELS[activeMode] ?? 0;
    const requiredLevel = AUTHORITY_LEVELS[requiredMode] ?? 4;

    if (activeLevel < requiredLevel) {
      throw new AuthorityViolationError(
        activeMode,
        operationName,
        `Cannot perform '${operationName}' in '${activeMode}' authority mode. Required authority: '${requiredMode}'.`
      );
    }
  }

  /**
   * Specifically checks whether a state-mutating operation (e.g. proposal apply, direct command execute)
   * can proceed under the active mode.
   */
  static assertCanMutateState(activeMode: AuthorityMode, operationName: string): void {
    if (activeMode === "observe") {
      throw new AuthorityViolationError(
        activeMode,
        operationName,
        `Workspace is in read-only 'observe' mode. Operation '${operationName}' blocked.`
      );
    }
  }

  /**
   * Specifically checks whether a proposal can be applied to the workspace.
   */
  static assertCanApplyProposal(activeMode: AuthorityMode): void {
    if (activeMode === "observe") {
      throw new AuthorityViolationError(
        activeMode,
        "applyProposal",
        `Applying proposals is blocked in read-only 'observe' authority mode.`
      );
    }
  }
}
