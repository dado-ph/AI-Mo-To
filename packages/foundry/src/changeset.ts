import type { ChangeSet } from "@ai-mo-to/protocol";
import type { FoundryInstallChangeSetInput, FoundryProposal, StagedModule } from "./types.js";

export class FoundryProposalConversionError extends Error {
  constructor(
    readonly code: "ExistingModuleProposalUnsupported",
    message: string,
  ) {
    super(message);
    this.name = "FoundryProposalConversionError";
  }
}

/**
 * Converts a validated, content-addressed generated bundle into an engine-owned
 * install request. The engine still verifies the directory bytes before commit.
 */
export function proposalToModuleInstallChangeSet(
  proposal: FoundryProposal,
  input: FoundryInstallChangeSetInput,
): ChangeSet {
  if (proposal.kind === "use-existing") {
    throw new FoundryProposalConversionError(
      "ExistingModuleProposalUnsupported",
      "Existing module proposals require an explicit source-selection flow and cannot be installed as generated local bundles.",
    );
  }

  assertInstallInput(input);
  const module = proposal.module;
  return {
    schemaVersion: "1.0.0",
    changeSetId: input.changeSetId,
    workspaceId: input.workspaceId,
    baseRevision: input.baseRevision,
    createdAt: input.createdAt,
    operations: [
      {
        operationId: input.operationId,
        kind: "module.install",
        input: {
          module: modulePin(module),
          stagedDigest: module.digest,
          requestedCapabilities: [...proposal.requestedCapabilities],
        },
        preconditions: [
          { kind: "workspace.revision.equals", value: input.baseRevision },
          { kind: "module.digest.equals", value: module.digest },
        ],
        effects: proposal.requestedCapabilities.map(
          (capability) => `capability.request:${capability}`,
        ),
        reversibility: "transactional",
      },
    ],
  };
}

function modulePin(module: StagedModule) {
  return {
    moduleId: module.moduleId,
    version: module.version,
    digest: module.digest,
    source: { kind: "local" as const, reference: module.directory },
  };
}

function assertInstallInput(input: FoundryInstallChangeSetInput): void {
  if (!input.workspaceId || !input.changeSetId || !input.operationId || !input.createdAt) {
    throw new Error("ChangeSet workspace, identifiers, and timestamp are required.");
  }
  if (!Number.isInteger(input.baseRevision) || input.baseRevision < 0) {
    throw new Error("ChangeSet base revision must be a non-negative integer.");
  }
}
