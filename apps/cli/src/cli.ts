import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import {
  EngineError,
  WorkspaceEngine,
  type WorkspaceInspection
} from "@ai-mo-to/engine";
import {
  JSON_ENVELOPE_VERSION,
  SCHEMA_VERSION,
  validateProtocol,
  type ChangeSet,
  type JsonEnvelope
} from "@ai-mo-to/protocol";

export interface CliIo {
  stdout(message: string): void;
  stderr(message: string): void;
}

export interface CliDependencies {
  engine?: WorkspaceEngine;
  cwd?: string;
  traceId?: () => string;
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function envelope<T>(
  command: string,
  traceId: string,
  result:
    | { data: T }
    | { error: NonNullable<JsonEnvelope<T>["error"]> }
): JsonEnvelope<T> {
  const value: JsonEnvelope<T> =
    "data" in result
      ? {
          envelopeVersion: JSON_ENVELOPE_VERSION,
          ok: true,
          command,
          traceId,
          data: result.data
        }
      : {
          envelopeVersion: JSON_ENVELOPE_VERSION,
          ok: false,
          command,
          traceId,
          error: result.error
        };

  const validation = validateProtocol("json-envelope", value);
  if (!validation.valid) {
    throw new Error("The CLI produced an invalid JSON envelope.");
  }
  return value;
}

function renderInspection(inspection: WorkspaceInspection): string {
  return [
    `${inspection.name} (${inspection.workspaceId})`,
    `Root: ${inspection.root}`,
    `Revision: ${inspection.revision}`,
    `Modules: ${inspection.modules.length}`,
    `Authority: ${inspection.authorityMode}`,
    `Health: ${inspection.health}`
  ].join("\n");
}

function usage(): string {
  return [
    "AI-Mo-To! CLI",
    "",
    "Commands:",
    '  aimoto workspace create "<name>" [--root <path>] [--json]',
    "  aimoto inspect [--workspace <path>] [--json]",
    "  aimoto snapshot create [--workspace <path>] [--json]",
    "  aimoto snapshot list [--workspace <path>] [--json]",
    "  aimoto snapshot inspect <snapshot-id> [--workspace <path>] [--json]",
    "  aimoto snapshot restore-plan <snapshot-id> [--workspace <path>] [--json]",
    "  aimoto plan --workspace <path> --set-authority <mode> [--json]",
    "  aimoto apply --workspace <path> --proposal <id> --hash <digest> [--principal <id>] [--json]"
  ].join("\n");
}

export async function runCli(
  args: string[],
  io: CliIo,
  dependencies: CliDependencies = {}
): Promise<number> {
  const engine = dependencies.engine ?? new WorkspaceEngine();
  const cwd = dependencies.cwd ?? process.cwd();
  const traceId = (dependencies.traceId ?? randomUUID)();
  const wantsJson = args.includes("--json");
  let command = args[0] ?? "help";

  if (args.includes("--help")) {
    io.stdout(usage());
    return 0;
  }

  try {
    let result: unknown;
    if (args[0] === "workspace" && args[1] === "create") {
      command = "workspace.create";
      const name = args[2];
      if (!name || name.startsWith("--")) {
        throw new EngineError(
          "InvalidInput",
          "workspace create requires a name."
        );
      }
      const root = resolve(cwd, option(args, "--root") ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
      result = await engine.createWorkspace({ root, name });
    } else if (args[0] === "inspect") {
      command = "inspect";
      const root = resolve(cwd, option(args, "--workspace") ?? ".");
      result = await engine.inspectWorkspace(root);
    } else if (args[0] === "snapshot") {
      const root = resolve(cwd, option(args, "--workspace") ?? ".");
      const action = args[1];
      command = `snapshot.${action ?? "unknown"}`;
      if (action === "create") result = await engine.createSnapshot(root);
      else if (action === "list") result = await engine.listSnapshots(root);
      else if (action === "inspect" || action === "restore-plan") {
        const snapshotId = args[2];
        if (!snapshotId || snapshotId.startsWith("--")) throw new EngineError("InvalidInput", `snapshot ${action} requires a snapshot id.`);
        result = action === "inspect"
          ? await engine.inspectSnapshot(root, snapshotId)
          : await engine.planSnapshotRestore(root, snapshotId);
      } else throw new EngineError("InvalidInput", "snapshot requires create, list, inspect, or restore-plan.");
    } else if (args[0] === "plan") {
      command = "plan";
      const root = resolve(cwd, option(args, "--workspace") ?? ".");
      const authorityMode = option(args, "--set-authority");
      if (!authorityMode) {
        throw new EngineError("InvalidInput", "plan requires --set-authority for this v0.1 slice.");
      }
      const workspace = await engine.inspectWorkspace(root);
      const changeSet: ChangeSet = {
        schemaVersion: SCHEMA_VERSION,
        changeSetId: randomUUID(),
        workspaceId: workspace.workspaceId,
        baseRevision: workspace.revision,
        createdAt: new Date().toISOString(),
        operations: [{
          operationId: "workspace-authority-mode",
          kind: "workspace.set-authority-mode",
          input: { authorityMode },
          preconditions: [{ kind: "workspace.revision", value: workspace.revision }],
          effects: ["workspace.settings.write"],
          reversibility: "reversible"
        }]
      };
      result = await engine.createProposal({
        root,
        changeSet,
        proposalId: randomUUID()
      });
    } else if (args[0] === "apply") {
      command = "apply";
      const root = resolve(cwd, option(args, "--workspace") ?? ".");
      const proposalId = option(args, "--proposal");
      const changeSetDigest = option(args, "--hash");
      if (!proposalId || !changeSetDigest) {
        throw new EngineError("InvalidInput", "apply requires --proposal and --hash.");
      }
      const proposal = engine.getProposal(root, proposalId);
      const principal = option(args, "--principal");
      result = await engine.approveProposal({
        root,
        approval: {
          schemaVersion: SCHEMA_VERSION,
          approvalId: randomUUID(),
          proposalId,
          workspaceId: proposal.workspaceId,
          baseRevision: proposal.baseRevision,
          changeSetDigest: changeSetDigest as `sha256:${string}`,
          approvedAt: new Date().toISOString(),
          ...(principal ? { approvedBy: principal } : {})
        }
      });
    } else {
      io.stdout(usage());
      return args.length === 0 || args[0] === "help" || args[0] === "--help"
        ? 0
        : 2;
    }

    io.stdout(
      wantsJson
        ? JSON.stringify(envelope(command, traceId, { data: result }))
        : "workspaceId" in (result as object)
          ? renderInspection(result as WorkspaceInspection)
          : JSON.stringify(result, null, 2)
    );
    return 0;
  } catch (error) {
    const engineError =
      error instanceof EngineError
        ? error
        : new EngineError("InternalError", "The command could not be completed.");
    const output = envelope(command, traceId, {
      error: {
        code: engineError.code,
        message: engineError.message,
        ...(engineError.details ? { details: engineError.details } : {})
      }
    });

    if (wantsJson) {
      io.stdout(JSON.stringify(output));
    } else {
      io.stderr(`${engineError.code}: ${engineError.message}`);
    }
    return engineError.code === "InternalError" ? 1 : 2;
  }
}
