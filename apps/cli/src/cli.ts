import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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
import {
  createHabitTrackerFoundry,
  createHabitTrackerPlan,
  proposalToModuleInstallChangeSet,
} from "@ai-mo-to/foundry";

export interface CliIo {
  stdout(message: string): void;
  stderr(message: string): void;
}

export interface CliDependencies {
  engine?: WorkspaceEngine;
  cwd?: string;
  traceId?: () => string;
  platform?: NodeJS.Platform;
  nodeVersion?: string;
  environment?: NodeJS.ProcessEnv;
  /** The packaged desktop executable hosting `--cli`, when applicable. */
  runtimeExecutable?: string;
  openDesktop?: (workspaceRoot: string) => Promise<{ launched: boolean; executable: string }>;
  doctorBootstrapProbe?: (engine: WorkspaceEngine) => Promise<DoctorCheck>;
}

type DoctorCheck = {
  id: string;
  ok: boolean;
  detail: string;
  remediation?: string;
  evidence?: Record<string, unknown>;
};

async function probeWorkspaceBootstrap(engine: WorkspaceEngine): Promise<DoctorCheck> {
  let probeDirectory: string | undefined;
  try {
    probeDirectory = await mkdtemp(join(tmpdir(), "aimoto-doctor-"));
    const workspaceRoot = join(probeDirectory, "workspace");
    const created = await engine.createWorkspace({
      root: workspaceRoot,
      name: "AI-Mo-To Doctor Probe",
      workspaceId: "aimoto-doctor-probe"
    });
    const inspected = await engine.inspectWorkspace(workspaceRoot);
    const moduleIds = inspected.modules.map((module) => module.moduleId).sort();
    const requiredModuleIds = ["aimoto.files", "aimoto.tasks"];
    const missingModuleIds = requiredModuleIds.filter((moduleId) => !moduleIds.includes(moduleId));
    if (created.revision !== 0 || inspected.revision !== 0 || inspected.health !== "ok" || missingModuleIds.length > 0) {
      return {
        id: "bootstrap",
        ok: false,
        detail: "A disposable workspace was created, but its initial resources or schema were incomplete.",
        remediation: "Reinstall AI-Mo-To so the CLI, built-in modules, and workspace schema come from the same release.",
        evidence: {
          createdRevision: created.revision,
          inspectedRevision: inspected.revision,
          health: inspected.health,
          moduleIds,
          missingModuleIds
        }
      };
    }
    return {
      id: "bootstrap",
      ok: true,
      detail: "Created, persisted, inspected, and verified a disposable workspace with the Files and Tasks resources.",
      evidence: {
        revision: inspected.revision,
        health: inspected.health,
        moduleIds,
        cleanup: "disposable probe directory removed"
      }
    };
  } catch (error) {
    const diagnosed = normalizeCliError(error);
    return {
      id: "bootstrap",
      ok: false,
      detail: `${diagnosed.code}: ${diagnosed.message}`,
      remediation: "Verify the installation contains the built-in Files and Tasks modules, then reinstall AI-Mo-To and run aimoto doctor again.",
      evidence: {
        error: {
          code: diagnosed.code,
          ...(diagnosed.details ? { details: diagnosed.details } : {})
        }
      }
    };
  } finally {
    if (probeDirectory) {
      await rm(probeDirectory, { recursive: true, force: true });
    }
  }
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

type SafeFailureDetails = {
  category: "filesystem" | "resource" | "schema" | "bootstrap" | "internal";
  retryable: boolean;
  remediation: string;
};

/**
 * Converts errors crossing the process boundary into a stable, deliberately
 * small public vocabulary. Never copy an exception's message, path, syscall,
 * stack, or environment into the envelope: those values can contain secrets.
 */
function normalizeCliError(error: unknown): EngineError {
  if (error instanceof EngineError && error.code !== "InternalError") return error;

  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
  const named = error instanceof Error ? error.name : undefined;
  const failure = (
    engineCode: ConstructorParameters<typeof EngineError>[0],
    message: string,
    details: SafeFailureDetails
  ) => new EngineError(engineCode, message, details);

  if (code === "ENOENT" || code === "ERR_MODULE_NOT_FOUND") {
    return failure("ResourceNotFound", "A required local resource was not found.", {
      category: "resource",
      retryable: false,
      remediation: "Verify the workspace or installation, then run aimoto doctor."
    });
  }
  if (code === "EACCES" || code === "EPERM" || code === "EROFS") {
    return failure("FilesystemAccessDenied", "AI-Mo-To could not access a required local resource.", {
      category: "filesystem",
      retryable: false,
      remediation: "Check the current user's permissions and whether the location is read-only."
    });
  }
  if (code === "EBUSY" || code === "ETXTBSY" || code === "SQLITE_BUSY" || code === "SQLITE_LOCKED") {
    return failure("ResourceBusy", "A required local resource is currently in use.", {
      category: "resource",
      retryable: true,
      remediation: "Close other processes using the workspace and retry."
    });
  }
  if (named === "SyntaxError" || code === "SQLITE_CORRUPT" || code === "SQLITE_NOTADB") {
    return failure("SchemaInvalid", "Stored workspace data is malformed or incompatible.", {
      category: "schema",
      retryable: false,
      remediation: "Run aimoto doctor and restore from a verified snapshot if available."
    });
  }
  if (code === "SQLITE_CANTOPEN" || code === "ERR_DLOPEN_FAILED") {
    return failure("BootstrapFailed", "A required AI-Mo-To runtime component could not start.", {
      category: "bootstrap",
      retryable: false,
      remediation: "Run aimoto doctor; reinstall AI-Mo-To if the installation check fails."
    });
  }
  return failure("InternalError", "The command could not be completed.", {
    category: "internal",
    retryable: false,
    remediation: "Retry once, then run aimoto doctor and report the traceId if the failure continues."
  });
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
    `Health: ${inspection.health}`,
    `History: ${inspection.evidence.revisions.length} revisions · ${inspection.evidence.approvals.length} approvals`,
    `Records: ${inspection.evidence.recordHealth.totalRecords} healthy`
  ].join("\n");
}

function usage(): string {
  return [
    "AI-Mo-To! CLI",
    "Turn a plain-language need into a local, inspectable, human-approved workspace.",
    "",
    "Start here:",
    '  aimoto init "<name>" [--root <path>] [--json]',
    '  aimoto request "<ordinary need>" --workspace <path> [--json]',
    "  aimoto doctor [--workspace <path>] [--json]",
    "  aimoto inspect [--workspace <path>] [--json]",
    "  aimoto module views --module <id> [--workspace <path>] [--json]",
    "  aimoto records list --module <id> [--collection <id>] [--workspace <path>] [--json]",
    '  aimoto habit create --id <id> --name "<name>" [--workspace <path>] [--json]',
    "  aimoto habit log --habit <id> --entry <id> --date <YYYY-MM-DD> [--workspace <path>] [--json]",
    '  aimoto agent habit plan --workspace <path> [--request "what you need"] [--json]',
    "  aimoto apply --workspace <path> --proposal <id> --hash <digest> [--json]",
    "  aimoto open [--workspace <path>] [--json]",
    "",
    "Commands:",
    '  aimoto init "<name>" [--root <path>] [--json]  Alias for workspace create',
    '  aimoto workspace create "<name>" [--root <path>] [--json]',
    '  aimoto request "<ordinary need>" --workspace <path> [--json]',
    "  aimoto inspect [--workspace <path>] [--json]",
    "  aimoto module views --module <id> [--workspace <path>] [--json]",
    "  aimoto records list --module <aimoto.files|aimoto.tasks|local.habit-tracker> [--collection <habit|habit-entry>] [--workspace <path>] [--json]",
    '  aimoto habit create --id <id> --name "<name>" [--workspace <path>] [--json]',
    "  aimoto habit log --habit <id> --entry <id> --date <YYYY-MM-DD> [--workspace <path>] [--json]",
    "  aimoto snapshot create [--workspace <path>] [--json]",
    "  aimoto snapshot list [--workspace <path>] [--json]",
    "  aimoto snapshot inspect <snapshot-id> [--workspace <path>] [--json]",
    "  aimoto snapshot restore-plan <snapshot-id> [--workspace <path>] [--json]",
    "  aimoto snapshot restore-propose <snapshot-id> [--workspace <path>] [--json]",
    '  aimoto agent habit plan --workspace <path> [--request "what you need"] [--json]',
    "  aimoto plan --workspace <path> --set-authority <mode> [--json]",
    "  aimoto apply --workspace <path> --proposal <id> --hash <digest> [--principal <id>] [--json]"
    ,""
    ,"Agent contract:"
    ,"  Add --json for one versioned envelope on stdout. Never parse human output."
    ,"  Planning changes nothing. Apply only after a human reviews the exact proposal and digest."
  ].join("\n");
}

async function defaultOpenDesktop(
  workspaceRoot: string,
  environment: NodeJS.ProcessEnv,
  runtimeExecutable?: string
): Promise<{ launched: boolean; executable: string }> {
  const candidates = desktopExecutableCandidates(environment, runtimeExecutable);
  for (const executable of candidates) {
    try {
      await access(executable);
      const child = spawn(executable, ["--workspace", workspaceRoot], {
        detached: true,
        stdio: "ignore",
        windowsHide: false
      });
      child.unref();
      return { launched: true, executable };
    } catch {
      // Try the next known installation location.
    }
  }
  throw new EngineError(
    "InvalidInput",
    "AI-Mo-To Desktop was not found. Install it or set AIMOTO_DESKTOP_PATH to AI-Mo-To.exe.",
    { checked: candidates }
  );
}

export function desktopExecutableCandidates(
  environment: NodeJS.ProcessEnv,
  runtimeExecutable?: string
): string[] {
  return [
    runtimeExecutable,
    environment.AIMOTO_DESKTOP_PATH,
    environment.LOCALAPPDATA
      ? resolve(environment.LOCALAPPDATA, "Programs", "AI-Mo-To", "AI-Mo-To.exe")
      : undefined
  ].filter((candidate, index, values): candidate is string =>
    Boolean(candidate) && values.indexOf(candidate) === index);
}

function renderHabitTrackerPlan(result: { request: string; proposal: { proposalId: string; changeSetDigest: string; changeSet: ChangeSet } }): string {
  const operation = result.proposal.changeSet.operations[0];
  return [
    "Habit Tracker is ready for your review.",
    `Request: ${result.request}`,
    "It will add: habits, daily check-ins, and completion history.",
    `It requests: ${(operation?.effects ?? []).map((effect) => effect.replace("capability.request:", "")).join(", ") || "no extra capabilities"}.`,
    `Proposal: ${result.proposal.proposalId}`,
    `Exact digest: ${result.proposal.changeSetDigest}`,
    "Approve it with: aimoto apply --workspace <path> --proposal <id> --hash <digest>",
  ].join("\n");
}

type OutcomeRequestResult = {
  request: string;
  understoodAs: string;
  explanation: string;
  changesApplied: false;
  approvalRequired: true;
  plan: ReturnType<typeof createHabitTrackerPlan>;
  stagedModule: {
    moduleId: string;
    version: string;
    digest: `sha256:${string}`;
    directory: string;
  };
  proposal: {
    proposalId: string;
    changeSetDigest: `sha256:${string}`;
    changeSet: ChangeSet;
  };
  next: {
    action: "review";
    commandTemplate: string;
  };
};

function supportsHabitOutcome(request: string): boolean {
  const normalized = request.toLowerCase();
  return [
    /\bhabit(s)?\b/,
    /\bdaily (routine|practice|check[- ]?in)s?\b/,
    /\btrack\b.*\b(meditat|exercise|workout|water|reading|read|sleep|streak)/,
    /\b(meditat|exercise|workout|reading|read)\b.*\b(every day|daily|regularly|progress|completion)/,
  ].some((pattern) => pattern.test(normalized));
}

async function createHabitOutcomeProposal(
  engine: WorkspaceEngine,
  root: string,
  request: string
): Promise<OutcomeRequestResult> {
  if (!request.trim()) {
    throw new EngineError("InvalidInput", "request requires an ordinary-language need.");
  }
  if (!supportsHabitOutcome(request)) {
    throw new EngineError(
      "InvalidInput",
      "AI-Mo-To understood the request, but this build cannot safely fulfill it. Its current outcome-level support is a daily Habit Tracker.",
      {
        request,
        supportedOutcomes: ["Track habits or recurring daily practices and review completion history."],
        changesApplied: false,
      }
    );
  }
  const workspace = await engine.inspectWorkspace(root);
  const foundry = createHabitTrackerFoundry(resolve(root, ".aimoto", "foundry", "staging"));
  const requestId = randomUUID();
  const plan = createHabitTrackerPlan(requestId);
  const staged = await foundry.stage({ requestId, workspaceId: workspace.workspaceId, text: request }, plan);
  if (!staged.ok) {
    throw new EngineError("ValidationFailed", "Habit Tracker staging did not pass local checks.", { diagnostics: staged.diagnostics });
  }
  if (staged.proposal.kind !== "install-generated") {
    throw new EngineError("ValidationFailed", "Habit Tracker must be a locally generated module.");
  }
  const changeSet = proposalToModuleInstallChangeSet(staged.proposal, {
    workspaceId: workspace.workspaceId,
    baseRevision: workspace.revision,
    changeSetId: randomUUID(),
    operationId: "install-habit-tracker",
    createdAt: new Date().toISOString(),
  });
  const proposal = await engine.createProposal({ root, changeSet, proposalId: randomUUID() });
  return {
    request,
    understoodAs: "Track habits or recurring daily practices.",
    explanation: "AI-Mo-To prepared a Habit Tracker with habits, daily check-ins, and completion history. Nothing has been installed.",
    changesApplied: false,
    approvalRequired: true,
    plan: staged.proposal.plan,
    stagedModule: staged.proposal.module,
    proposal,
    next: {
      action: "review",
      commandTemplate: "aimoto apply --workspace <path> --proposal <id> --hash <digest>",
    },
  };
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
  const environment = dependencies.environment ?? process.env;
  let command = args[0] ?? "help";

  if (args.includes("--help")) {
    io.stdout(wantsJson
      ? JSON.stringify(envelope("help", traceId, {
          data: {
            summary: "Turn a plain-language need into a local, inspectable, human-approved workspace.",
            usage: usage(),
            jsonEnvelopeVersion: JSON_ENVELOPE_VERSION,
            approvalRule: "Review the exact proposal and digest before apply."
          }
        }))
      : usage());
    return 0;
  }

  try {
    let result: unknown;
    if (args[0] === "init" || (args[0] === "workspace" && args[1] === "create")) {
      command = args[0] === "init" ? "init" : "workspace.create";
      const name = args[0] === "init" ? args[1] : args[2];
      if (!name || name.startsWith("--")) {
        throw new EngineError(
          "InvalidInput",
          `${args[0] === "init" ? "init" : "workspace create"} requires a name.`
        );
      }
      const root = resolve(cwd, option(args, "--root") ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
      result = await engine.createWorkspace({ root, name });
    } else if (args[0] === "doctor") {
      command = "doctor";
      const platform = dependencies.platform ?? process.platform;
      const nodeVersion = dependencies.nodeVersion ?? process.versions.node;
      const major = Number.parseInt(nodeVersion.split(".")[0] ?? "0", 10);
      const requestedRoot = option(args, "--workspace");
      let workspace: WorkspaceInspection | undefined;
      let workspaceError: { code: string; message: string } | undefined;
      if (requestedRoot) {
        try {
          workspace = await engine.inspectWorkspace(resolve(cwd, requestedRoot));
        } catch (error) {
          const diagnosed = normalizeCliError(error);
          workspaceError = { code: diagnosed.code, message: diagnosed.message };
        }
      }
      const bootstrapCheck = await (dependencies.doctorBootstrapProbe ?? probeWorkspaceBootstrap)(engine);
      const checks: DoctorCheck[] = [
        { id: "node", ok: major >= 22, detail: `Node.js ${nodeVersion}; 22 or newer is required.` },
        { id: "platform", ok: platform === "win32", detail: `${platform}; the installable desktop currently targets Windows.` },
        bootstrapCheck,
        ...(requestedRoot
          ? [{ id: "workspace", ok: Boolean(workspace), detail: workspace
              ? `${workspace.name} is healthy at revision ${workspace.revision}.`
              : `${workspaceError?.code ?? "InternalError"}: ${workspaceError?.message ?? "Inspection failed."}` }]
          : [])
      ];
      result = {
        healthy: checks.every((check) => check.ok),
        checks,
        ...(workspace ? { workspace } : {}),
        next: checks.every((check) => check.ok)
          ? requestedRoot
            ? "Use aimoto inspect, then plan a change for human review."
            : 'Create a workspace with: aimoto init "My Workspace"'
          : "Resolve the failed checks and run aimoto doctor again before creating or changing a workspace."
      };
    } else if (args[0] === "inspect") {
      command = "inspect";
      const root = resolve(cwd, option(args, "--workspace") ?? ".");
      result = await engine.inspectWorkspace(root);
    } else if (args[0] === "module" && args[1] === "views") {
      command = "module.views";
      const root = resolve(cwd, option(args, "--workspace") ?? ".");
      const moduleId = option(args, "--module");
      if (!moduleId) throw new EngineError("InvalidInput", "module views requires --module.");
      result = await engine.listInstalledModuleViews(root, moduleId);
    } else if (args[0] === "records" && args[1] === "list") {
      command = "records.list";
      const root = resolve(cwd, option(args, "--workspace") ?? ".");
      const moduleId = option(args, "--module");
      if (moduleId === "aimoto.files" || moduleId === "aimoto.tasks") {
        if (option(args, "--collection")) {
          throw new EngineError("InvalidInput", "--collection is only used with local.habit-tracker.");
        }
        result = await engine.listBuiltInRecords(root, moduleId);
      } else if (moduleId === "local.habit-tracker") {
        const collectionId = option(args, "--collection");
        if (collectionId !== "habit" && collectionId !== "habit-entry") {
          throw new EngineError("InvalidInput", "Habit Tracker records require --collection habit or --collection habit-entry.");
        }
        result = await engine.listHabitTrackerRecords(root, collectionId);
      } else {
        throw new EngineError("InvalidInput", "records list requires a supported --module.");
      }
    } else if (args[0] === "habit" && args[1] === "create") {
      command = "habit.create";
      const root = resolve(cwd, option(args, "--workspace") ?? ".");
      const habitId = option(args, "--id");
      const name = option(args, "--name");
      if (!habitId || !name) throw new EngineError("InvalidInput", "habit create requires --id and --name.");
      result = await engine.executeHabitTrackerCommand({
        root, command: "create-habit", input: { habitId, name }
      });
    } else if (args[0] === "habit" && args[1] === "log") {
      command = "habit.log";
      const root = resolve(cwd, option(args, "--workspace") ?? ".");
      const habitId = option(args, "--habit");
      const entryId = option(args, "--entry");
      const completedOn = option(args, "--date");
      if (!habitId || !entryId || !completedOn) {
        throw new EngineError("InvalidInput", "habit log requires --habit, --entry, and --date.");
      }
      result = await engine.executeHabitTrackerCommand({
        root, command: "log-completion", input: { habitId, entryId, completedOn }
      });
    } else if (args[0] === "snapshot") {
      const root = resolve(cwd, option(args, "--workspace") ?? ".");
      const action = args[1];
      command = `snapshot.${action ?? "unknown"}`;
      if (action === "create") result = await engine.createSnapshot(root);
      else if (action === "list") result = await engine.listSnapshots(root);
      else if (action === "inspect" || action === "restore-plan" || action === "restore-propose") {
        const snapshotId = args[2];
        if (!snapshotId || snapshotId.startsWith("--")) throw new EngineError("InvalidInput", `snapshot ${action} requires a snapshot id.`);
        result = action === "inspect"
          ? await engine.inspectSnapshot(root, snapshotId)
          : action === "restore-plan"
            ? await engine.planSnapshotRestore(root, snapshotId)
            : await engine.createSnapshotRestoreProposal({ root, snapshotId, proposalId: randomUUID() });
      } else throw new EngineError("InvalidInput", "snapshot requires create, list, inspect, restore-plan, or restore-propose.");
    } else if (args[0] === "request") {
      command = "request";
      const request = args[1];
      if (!request || request.startsWith("--")) {
        throw new EngineError("InvalidInput", 'request requires a need, for example: aimoto request "Help me track meditation every day" --workspace <path>');
      }
      const root = resolve(cwd, option(args, "--workspace") ?? ".");
      result = await createHabitOutcomeProposal(engine, root, request);
    } else if (args[0] === "agent" && args[1] === "habit" && args[2] === "plan") {
      command = "agent.habit.plan";
      const root = resolve(cwd, option(args, "--workspace") ?? ".");
      const request = option(args, "--request") ?? "Add a Habit Tracker";
      result = await createHabitOutcomeProposal(engine, root, request);
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
    } else if (args[0] === "open") {
      command = "open";
      const root = resolve(cwd, option(args, "--workspace") ?? ".");
      const workspace = await engine.inspectWorkspace(root);
      const opened = await (dependencies.openDesktop ?? ((workspaceRoot) =>
        defaultOpenDesktop(workspaceRoot, environment, dependencies.runtimeExecutable)))(workspace.root);
      result = { ...opened, workspace };
    } else {
      if (args.length === 0 || args[0] === "help" || args[0] === "--help") {
        io.stdout(wantsJson
          ? JSON.stringify(envelope("help", traceId, { data: { usage: usage(), jsonEnvelopeVersion: JSON_ENVELOPE_VERSION } }))
          : usage());
        return 0;
      }
      throw new EngineError(
        "InvalidInput",
        `Unknown command "${args[0]}". Run aimoto --help to see supported commands.`
      );
    }

    io.stdout(
      wantsJson
        ? JSON.stringify(envelope(command, traceId, { data: result }))
        : command === "agent.habit.plan" || command === "request"
          ? renderHabitTrackerPlan(result as { request: string; proposal: { proposalId: string; changeSetDigest: string; changeSet: ChangeSet } })
        : command === "doctor"
          ? (result as { healthy: boolean; checks: DoctorCheck[]; next: string }).checks
              .flatMap((check) => [
                `${check.ok ? "PASS" : "FAIL"} ${check.id}: ${check.detail}`,
                ...(!check.ok && check.remediation ? [`  Fix: ${check.remediation}`] : [])
              ])
              .concat((result as { next: string }).next)
              .join("\n")
        : command === "open"
          ? `Opened AI-Mo-To Desktop for ${(result as { workspace: WorkspaceInspection }).workspace.name}.`
        : "workspaceId" in (result as object)
          ? renderInspection(result as WorkspaceInspection)
          : JSON.stringify(result, null, 2)
    );
    if (command === "doctor" && !(result as { healthy: boolean }).healthy) {
      return 1;
    }
    return 0;
  } catch (error) {
    const engineError = normalizeCliError(error);
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
