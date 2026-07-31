import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { access, mkdtemp, rm, readFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function createDesktopShortcut(workspaceName: string, workspaceRoot: string): Promise<string> {
  const desktopDir = join(homedir(), "Desktop");
  const shortcutPath = join(desktopDir, `${workspaceName}.lnk`);
  const aimotoCmd = join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "Microsoft", "WindowsApps", "aimoto.cmd");
  const psScript = `
    $WshShell = New-Object -ComObject WScript.Shell;
    $Shortcut = $WshShell.CreateShortcut('${shortcutPath.replace(/'/g, "''")}');
    $Shortcut.TargetPath = '${aimotoCmd.replace(/'/g, "''")}';
    $Shortcut.Arguments = 'open --workspace "${workspaceRoot.replace(/"/g, '""')}"';
    $Shortcut.Description = 'Open ${workspaceName} in AI-Mo-To';
    $Shortcut.Save();
  `;
  try {
    await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psScript]);
    return shortcutPath;
  } catch (err) {
    return shortcutPath;
  }
}

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
  createDynamicTrackerFoundry,
  createDynamicTrackerPlan,
  createHabitTrackerFoundry,
  createHabitTrackerPlan,
  createResearchCollectorFoundry,
  createResearchCollectorPlan,
  createTaskManagerFoundry,
  createTaskManagerPlan,
  proposalToModuleInstallChangeSet,
  allocateAgentAppRepository,
  DEFAULT_AGENT_GUIDE,
  createCodexCliProvider,
  type AgentProvider,
  verifyStagedModule,
  digestStagedModule,
} from "@ai-mo-to/foundry";
import { registerWorkspace, resolveRegisteredWorkspace } from "./workspace-registry.js";

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
  /** Optional external coding-agent adapter used by `request --agent`. */
  agentProvider?: AgentProvider;
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

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  gold: "\x1b[38;2;240;192;60m",
  goldBold: "\x1b[1;38;2;245;200;65m",
  goldDim: "\x1b[38;2;190;150;50m",
  forestGreen: "\x1b[38;2;52;168;104m",
  forestGreenBold: "\x1b[1;38;2;60;185;115m",
  darkForestGreen: "\x1b[38;2;30;95;55m",
  emeraldGreen: "\x1b[38;2;80;200;120m",
  red: "\x1b[38;2;235;87;87m",
  redBold: "\x1b[1;38;2;245;100;100m"
};

function supportsColor(): boolean {
  if (process.env.NO_COLOR || process.env.NODE_DISABLE_COLORS) return false;
  return Boolean(process.stdout?.isTTY ?? true);
}

function renderAsciiBanner(color: boolean = supportsColor()): string {
  const g = color ? ANSI.goldBold : "";
  const f = color ? ANSI.forestGreenBold : "";
  const r = color ? ANSI.reset : "";
  const df = color ? ANSI.darkForestGreen : "";
  const sub = color ? ANSI.gold : "";

  return [
    "",
    "",
    `${g}  █████╗ ██╗   ███╗   ███╗ ██████╗       ████████╗██████╗ ${r}`,
    `${g} ██╔══██╗██║   ████╗ ████║██╔═══██╗      ╚══██╔══╝██╔═══██╗${r}`,
    `${f} ███████║██║   ██╔████╔██║██║   ██║  █████╗  ██║  ██║   ██║${r}`,
    `${f} ██╔══██║██║   ██║╚██╔╝██║██║   ██║  ╚════╝  ██║  ██║   ██║${r}`,
    `${f} ██║  ██║██║   ██║ ╚═╝ ██║╚██████╔╝          ██║  ╚██████╔╝${r}`,
    `${df} ╚═╝  ╚═╝╚═╝   ╚═╝     ╚═╝ ╚═════╝           ╚═╝   ╚═════╝ ${r}`,
    `${sub}  🌲 Human-Governed Local AI Workspace Foundry 🌲${r}`,
    ""
  ].join("\n");
}

function isWorkspaceInspection(result: unknown): result is WorkspaceInspection {
  return (
    typeof result === "object" &&
    result !== null &&
    "health" in result &&
    "modules" in result &&
    "authorityMode" in result
  );
}

function isProposal(result: unknown): result is { proposalId: string; workspaceId: string; baseRevision: number; changeSetDigest: string } {
  return (
    typeof result === "object" &&
    result !== null &&
    "proposalId" in result &&
    "changeSetDigest" in result
  );
}

function renderInspection(inspection: WorkspaceInspection, color: boolean = supportsColor()): string {
  if (!color) {
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

  const g = ANSI.goldBold;
  const f = ANSI.forestGreen;
  const fBold = ANSI.forestGreenBold;
  const e = ANSI.emeraldGreen;
  const r = ANSI.reset;
  const dim = ANSI.goldDim;

  return [
    `${g}${inspection.name}${r} ${dim}(${inspection.workspaceId})${r}`,
    `Root: ${f}${inspection.root}${r}`,
    `Revision: ${fBold}${inspection.revision}${r}`,
    `Modules: ${fBold}${inspection.modules.length}${r}`,
    `Authority: ${g}${inspection.authorityMode}${r}`,
    `Health: ${inspection.health === "ok" ? `${e}ok${r}` : `${ANSI.red}${inspection.health}${r}`}`,
    `History: ${f}${inspection.evidence.revisions.length} revisions · ${inspection.evidence.approvals.length} approvals${r}`,
    `Records: ${e}${inspection.evidence.recordHealth.totalRecords} healthy${r}`
  ].join("\n");
}

function renderProposal(
  proposal: { proposalId: string; workspaceId: string; baseRevision: number; changeSetDigest: string },
  workspaceRoot?: string,
  color: boolean = supportsColor()
): string {
  const wsFlag = workspaceRoot ? ` --workspace ${workspaceRoot}` : "";
  const applyCommand = `aimoto apply${wsFlag} --proposal ${proposal.proposalId} --hash ${proposal.changeSetDigest}`;

  if (!color) {
    return [
      "Proposal created and ready for human review.",
      `Workspace: ${proposal.workspaceId} (base revision ${proposal.baseRevision})`,
      `Proposal ID: ${proposal.proposalId}`,
      `Exact digest: ${proposal.changeSetDigest}`,
      `Approve it with: ${applyCommand}`,
    ].join("\n");
  }

  const g = ANSI.goldBold;
  const f = ANSI.forestGreen;
  const fBold = ANSI.forestGreenBold;
  const r = ANSI.reset;

  return [
    `${g}Proposal created and ready for human review.${r}`,
    `Workspace: ${f}${proposal.workspaceId}${r} (base revision ${fBold}${proposal.baseRevision}${r})`,
    `Proposal ID: ${f}${proposal.proposalId}${r}`,
    `Exact digest: ${g}${proposal.changeSetDigest}${r}`,
    `Approve it with: ${fBold}${applyCommand}${r}`,
  ].join("\n");
}

function usage(color: boolean = supportsColor(), showBanner: boolean = color): string {
  const g = color ? ANSI.goldBold : "";
  const f = color ? ANSI.forestGreen : "";
  const fBold = color ? ANSI.forestGreenBold : "";
  const dim = color ? ANSI.goldDim : "";
  const r = color ? ANSI.reset : "";

  const banner = showBanner ? renderAsciiBanner(color) : "";

  return [
    banner + `${g}AI-Mo-To! CLI${r}`,
    `${f}Turn a plain-language need into a local, inspectable, human-approved workspace.${r}`,
    "",
    `${g}Start here:${r}`,
    `  ${fBold}aimoto init${r} ${f}"<name>" [--root <path>] [--json]${r}`,
    `  ${fBold}aimoto request${r} ${f}"<ordinary need>" --workspace <path> [--json]${r}`,
    `  ${fBold}aimoto doctor${r} ${f}[--workspace <path>] [--json]${r}`,
    `  ${fBold}aimoto inspect${r} ${f}[--workspace <path>] [--json]${r}`,
    `  ${fBold}aimoto module views${r} ${f}--module <id> [--workspace <path>] [--json]${r}`,
    `  ${fBold}aimoto records list${r} ${f}--module <id> [--collection <id>] [--workspace <path>] [--json]${r}`,
    `  ${fBold}aimoto habit create${r} ${f}--id <id> --name "<name>" [--workspace <path>] [--json]${r}`,
    `  ${fBold}aimoto habit log${r} ${f}--habit <id> --entry <id> --date <YYYY-MM-DD> [--workspace <path>] [--json]${r}`,
    `  ${fBold}aimoto agent habit plan${r} ${f}--workspace <path> [--request "what you need"] [--json]${r}`,
    `  ${fBold}aimoto apply${r} ${f}--workspace <path> --proposal <id> --hash <digest> [--json]${r}`,
    `  ${fBold}aimoto open${r} ${f}[--workspace <path>] [--json]${r}`,
    "",
    `${g}Commands:${r}`,
    `  ${fBold}aimoto init${r} ${f}"<name>" [--root <path>] [--json]  ${dim}Alias for workspace create${r}`,
    `  ${fBold}aimoto workspace create${r} ${f}"<name>" [--root <path>] [--json]${r}`,
    `  ${fBold}aimoto request${r} ${f}"<ordinary need>" --workspace <path> [--json]${r}`,
    `  ${fBold}aimoto inspect${r} ${f}[--workspace <path>] [--json]${r}`,
    `  ${fBold}aimoto module views${r} ${f}--module <id> [--workspace <path>] [--json]${r}`,
    `  ${fBold}aimoto records list${r} ${f}--module <aimoto.files|aimoto.tasks|local.habit-tracker> [--collection <habit|habit-entry>] [--workspace <path>] [--json]${r}`,
    `  ${fBold}aimoto habit create${r} ${f}--id <id> --name "<name>" [--workspace <path>] [--json]${r}`,
    `  ${fBold}aimoto habit log${r} ${f}--habit <id> --entry <id> --date <YYYY-MM-DD> [--workspace <path>] [--json]${r}`,
    `  ${fBold}aimoto snapshot create${r} ${f}[--workspace <path>] [--json]${r}`,
    `  ${fBold}aimoto snapshot list${r} ${f}[--workspace <path>] [--json]${r}`,
    `  ${fBold}aimoto snapshot inspect${r} ${f}<snapshot-id> [--workspace <path>] [--json]${r}`,
    `  ${fBold}aimoto snapshot restore-plan${r} ${f}<snapshot-id> [--workspace <path>] [--json]${r}`,
    `  ${fBold}aimoto snapshot restore-propose${r} ${f}<snapshot-id> [--workspace <path>] [--json]${r}`,
    `  ${fBold}aimoto agent habit plan${r} ${f}--workspace <path> [--request "what you need"] [--json]${r}`,
    `  ${fBold}aimoto plan${r} ${f}--workspace <path> --set-authority <mode> [--json]${r}`,
    `  ${fBold}aimoto apply${r} ${f}--workspace <path> --proposal <id> --hash <digest> [--principal <id>] [--json]${r}`,
    "",
    `${g}Agent contract:${r}`,
    `  ${dim}Add --json for one versioned envelope on stdout. Never parse human output.${r}`,
    `  ${dim}Planning changes nothing. Apply only after a human reviews the exact proposal and digest.${r}`
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

export async function findWorkspaceDirectory(startDir: string): Promise<string | undefined> {
  let current = resolve(startDir);
  while (true) {
    try {
      await access(join(current, ".aimoto", "workspace.json"));
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return undefined;
}

export async function resolveWorkspacePath(
  cwd: string,
  requestedWorkspace?: string,
  environment: NodeJS.ProcessEnv = process.env,
  fallbackToDefault: boolean = false
): Promise<string> {
  if (requestedWorkspace) {
    return (await resolveRegisteredWorkspace(requestedWorkspace, environment)) ?? resolve(cwd, requestedWorkspace);
  }
  if (environment.AIMOTO_WORKSPACE) {
    return resolve(cwd, environment.AIMOTO_WORKSPACE);
  }
  const found = await findWorkspaceDirectory(cwd);
  if (found) {
    return found;
  }
  const registered = await resolveRegisteredWorkspace("default", environment);
  if (registered) return registered;
  if (fallbackToDefault) {
    return environment.LOCALAPPDATA
      ? resolve(environment.LOCALAPPDATA, "AI-Mo-To", "workspaces", "default")
      : resolve(homedir(), ".aimoto", "workspaces", "default");
  }
  return resolve(cwd, ".");
}

export async function ensureWorkspaceResolved(
  engine: WorkspaceEngine,
  root: string
): Promise<string> {
  try {
    await engine.inspectWorkspace(root);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "WorkspaceNotFound") {
      await engine.createWorkspace({ root, name: "Default Workspace", workspaceId: "default" });
    } else {
      throw error;
    }
  }
  return root;
}

function renderOutcomePlan(
  result: { request: string; workspaceRoot?: string; plan: { displayName: string; userOutcomes: string[] }; proposal: { proposalId: string; changeSetDigest: string; changeSet: ChangeSet } },
  color: boolean = supportsColor()
): string {
  const operation = result.proposal.changeSet.operations[0];
  const wsFlag = result.workspaceRoot ? ` --workspace ${result.workspaceRoot}` : "";
  const applyCommand = `aimoto apply${wsFlag} --proposal ${result.proposal.proposalId} --hash ${result.proposal.changeSetDigest}`;
  const outcomesText = result.plan.userOutcomes.join("; ");

  if (!color) {
    return [
      `${result.plan.displayName} is ready for your review.`,
      `Request: ${result.request}`,
      `It will add: ${outcomesText}.`,
      `It requests: ${(operation?.effects ?? []).map((effect) => effect.replace("capability.request:", "")).join(", ") || "no extra capabilities"}.`,
      `Proposal: ${result.proposal.proposalId}`,
      `Exact digest: ${result.proposal.changeSetDigest}`,
      `Approve it with: ${applyCommand}`,
    ].join("\n");
  }

  const g = ANSI.goldBold;
  const f = ANSI.forestGreen;
  const fBold = ANSI.forestGreenBold;
  const r = ANSI.reset;

  return [
    `${g}${result.plan.displayName} is ready for your review.${r}`,
    `Request: ${f}${result.request}${r}`,
    `It will add: ${outcomesText}.`,
    `It requests: ${fBold}${(operation?.effects ?? []).map((effect) => effect.replace("capability.request:", "")).join(", ") || "no extra capabilities"}.${r}`,
    `Proposal: ${f}${result.proposal.proposalId}${r}`,
    `Exact digest: ${g}${result.proposal.changeSetDigest}${r}`,
    `Approve it with: ${fBold}${applyCommand}${r}`,
  ].join("\n");
}

type OutcomeRequestResult = {
  request: string;
  workspaceRoot?: string;
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

function classifyOutcomeCategory(request: string): "habit" | "task" | "research" | "custom" {
  const normalized = request.toLowerCase();
  if (
    /\bhabit(s)?\b/.test(normalized) ||
    /\bdaily (routine|practice|check[- ]?in)s?\b/.test(normalized) ||
    /\btrack\b.*\b(meditat|exercise|workout|water|reading|read|sleep|streak)/.test(normalized) ||
    /\b(meditat|exercise|workout|reading|read)\b.*\b(every day|daily|regularly|progress|completion)/.test(normalized)
  ) {
    return "habit";
  }
  if (
    /\b(task|tasks|todo|todos|action item|action items|project board|assign|assignment|ticket|tickets)\b/.test(normalized) ||
    /\bmanage\b.*\b(task|todo|project)/.test(normalized)
  ) {
    return "task";
  }
  if (
    /\b(research|paper|excerpt|reading note|study|paper summary|bookmark|sources|literature)\b/.test(normalized) ||
    /\b(collect|save|read)\b.*\b(research|paper|note|study)/.test(normalized)
  ) {
    return "research";
  }
  return "custom";
}

async function createOutcomeProposal(
  engine: WorkspaceEngine,
  root: string,
  request: string,
  workspaceRoot?: string,
  agentProvider?: AgentProvider
): Promise<OutcomeRequestResult> {
  if (!request.trim()) {
    throw new EngineError("InvalidInput", "request requires an ordinary-language need.");
  }
  let workspace: WorkspaceInspection;
  try {
    workspace = await engine.inspectWorkspace(root);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "WorkspaceNotFound") {
      const folderName = workspaceRoot ? workspaceRoot.split(/[\\/]/).pop() || "Workspace" : "Default Workspace";
      workspace = await engine.createWorkspace({ root, name: folderName, workspaceId: folderName.toLowerCase().replace(/[^a-z0-9]+/g, "-") });
    } else {
      throw error;
    }
  }
  const category = classifyOutcomeCategory(request);
  if (agentProvider) {
    const appId = `app-${randomUUID()}`;
    const app = await allocateAgentAppRepository(resolve(root, ".aimoto"), appId, request, DEFAULT_AGENT_GUIDE);
    let retainAgentRepository = false;
    try {
      const result = await agentProvider.run({ repositoryRoot: app.root, promptFile: app.promptFile });
      if (result.exitCode !== 0) {
        throw new EngineError("ValidationFailed", `Agent provider '${agentProvider.name}' failed while building the app.`, { app, result });
      }
    let manifest: {
      moduleId?: string;
      version?: string;
      requestedCapabilities?: string[];
      views?: Array<{ id?: string; kind?: string; declaration?: string }>;
    };
    try { manifest = JSON.parse(await readFile(join(app.root, "module.json"), "utf8")); }
    catch {
      throw new EngineError(
        "ValidationFailed",
        "Agent must produce a valid module.json manifest in the generated app repository.",
        { app, provider: { name: agentProvider.name, output: result.output?.slice(-4_000) } }
      );
    }
    if (!manifest.moduleId || !manifest.version) throw new EngineError("ValidationFailed", "module.json must include moduleId and version.", { app });
    const manifestValidation = validateProtocol("module-manifest", manifest);
    if (!manifestValidation.valid) {
      throw new EngineError("ValidationFailed", "The generated module manifest does not satisfy the AI-Mo-To module contract.", { app, diagnostics: manifestValidation.errors });
    }
    const appViews = (manifest.views ?? []).filter(view => view.kind === "app");
    if (appViews.length === 0) {
      throw new EngineError("ValidationFailed", "The generated application must expose at least one runnable app view.", { app });
    }
    for (const view of appViews) {
      if (!view.declaration) {
        throw new EngineError("ValidationFailed", `Generated app view ${view.id ?? "unknown"} has no declaration.`, { app });
      }
      const declarationPath = resolve(app.root, view.declaration);
      if (!declarationPath.startsWith(`${app.root}\\`) && !declarationPath.startsWith(`${app.root}/`)) {
        throw new EngineError("ValidationFailed", "A generated app view declaration escaped its repository.", { app });
      }
      const declaration = JSON.parse(await readFile(declarationPath, "utf8")) as { kind?: unknown; entry?: unknown };
      if (declaration.kind !== "app" || typeof declaration.entry !== "string") {
        throw new EngineError("ValidationFailed", `Generated app view ${view.id ?? "unknown"} has no runnable entrypoint.`, { app });
      }
      const entryPath = resolve(app.root, declaration.entry);
      if (
        extname(entryPath).toLowerCase() !== ".html" ||
        (!entryPath.startsWith(`${app.root}\\`) && !entryPath.startsWith(`${app.root}/`))
      ) {
        throw new EngineError("ValidationFailed", `Generated app view ${view.id ?? "unknown"} has an invalid HTML entrypoint.`, { app });
      }
      const html = await readFile(entryPath, "utf8");
      if (!/<(?:button|input|select|textarea|form)\b/i.test(html) || !/<script\b/i.test(html)) {
        throw new EngineError("ValidationFailed", `Generated app view ${view.id ?? "unknown"} is not interactive.`, { app });
      }
      if (!/\b(?:localStorage|indexedDB)\b/.test(html)) {
        throw new EngineError("ValidationFailed", `Generated app view ${view.id ?? "unknown"} does not persist user state.`, { app });
      }
    }
    const digest = await digestStagedModule(app.root);
    if (!(await verifyStagedModule(app.root, digest))) throw new EngineError("ValidationFailed", "Generated module content digest could not be verified.", { app });
    const requestedCapabilities = manifest.requestedCapabilities?.length ? manifest.requestedCapabilities : ["app.generated.install"];
    const plan = { requestId: appId, moduleId: manifest.moduleId, displayName: manifest.moduleId, userOutcomes: [request], records: [], views: [], commands: [], events: [], requestedCapabilities };
    const stagedModule = { moduleId: manifest.moduleId, version: manifest.version, digest, directory: app.root };
    const changeSet = proposalToModuleInstallChangeSet({ kind: "install-generated", requestId: appId, plan, module: stagedModule, requestedCapabilities: plan.requestedCapabilities, checks: { staticValidation: { ok: true, diagnostics: [] }, dryActivation: { ok: true, diagnostics: [] } } }, { workspaceId: workspace.workspaceId, baseRevision: workspace.revision, changeSetId: randomUUID(), operationId: `install-${manifest.moduleId}`, createdAt: new Date().toISOString() });
    // The generated repository may propose the workspace's navigation/home
    // surface. It is still reviewed and digest-bound as part of this ChangeSet.
    let generatedLayout: { homeView?: unknown; views?: unknown } | undefined;
    try {
      const workspaceSpec = JSON.parse(await readFile(join(app.root, "aimoto.workspace.json"), "utf8")) as { layout?: { homeView?: unknown; views?: unknown } };
      generatedLayout = workspaceSpec.layout;
    } catch {
      // The host default layout remains valid when the agent does not provide
      // a custom workspace surface.
    }
    if (generatedLayout) changeSet.operations[0]!.input.workspaceLayout = generatedLayout;
      const proposal = await engine.createProposal({ root, changeSet, proposalId: randomUUID() });
      retainAgentRepository = true;
      return { request, ...(workspaceRoot ? { workspaceRoot } : {}), understoodAs: `Build ${manifest.moduleId}`, explanation: "Agent-built module is ready for review. Nothing has been installed.", changesApplied: false, approvalRequired: true, plan, stagedModule, proposal, next: { action: "review", commandTemplate: `aimoto apply --proposal ${proposal.proposalId} --hash ${proposal.changeSetDigest}` } };
    } finally {
      // Only a digest-bound proposal owns a generated repository. Provider,
      // schema, runtime, or persistence failures leave no unexplained debris.
      if (!retainAgentRepository) await rm(app.root, { recursive: true, force: true });
    }
  }
  const stagingRoot = resolve(root, ".aimoto", "foundry", "staging");

  let foundry;
  let plan;
  const requestId = randomUUID();

  if (category === "habit") {
    foundry = createHabitTrackerFoundry(stagingRoot);
    plan = createHabitTrackerPlan(requestId);
  } else if (category === "task") {
    foundry = createTaskManagerFoundry(stagingRoot);
    plan = createTaskManagerPlan(requestId);
  } else if (category === "research") {
    foundry = createResearchCollectorFoundry(stagingRoot);
    plan = createResearchCollectorPlan(requestId);
  } else {
    foundry = createDynamicTrackerFoundry(stagingRoot, request);
    plan = createDynamicTrackerPlan(requestId, request);
  }

  const staged = await foundry.stage({ requestId, workspaceId: workspace.workspaceId, text: request }, plan);
  if (!staged.ok) {
    throw new EngineError("ValidationFailed", `${plan.displayName} staging did not pass local checks.`, { diagnostics: staged.diagnostics });
  }
  if (staged.proposal.kind !== "install-generated") {
    throw new EngineError("ValidationFailed", `${plan.displayName} must be a locally generated module.`);
  }
  const changeSet = proposalToModuleInstallChangeSet(staged.proposal, {
    workspaceId: workspace.workspaceId,
    baseRevision: workspace.revision,
    changeSetId: randomUUID(),
    operationId: `install-${plan.moduleId.replace(/^local\./, "")}`,
    createdAt: new Date().toISOString(),
  });
  const proposal = await engine.createProposal({ root, changeSet, proposalId: randomUUID() });
  const wsFlag = workspaceRoot ? ` --workspace ${workspaceRoot}` : "";
  return {
    request,
    ...(workspaceRoot ? { workspaceRoot } : {}),
    understoodAs: `Create and manage ${plan.displayName}`,
    explanation: `AI-Mo-To prepared ${plan.displayName} with ${plan.records.map((r) => r.name).join(", ")}. Nothing has been installed.`,
    changesApplied: false,
    approvalRequired: true,
    plan: staged.proposal.plan,
    stagedModule: staged.proposal.module,
    proposal,
    next: {
      action: "review",
      commandTemplate: `aimoto apply${wsFlag} --proposal ${proposal.proposalId} --hash ${proposal.changeSetDigest}`,
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
            usage: usage(false, false),
            jsonEnvelopeVersion: JSON_ENVELOPE_VERSION,
            approvalRule: "Review the exact proposal and digest before apply."
          }
        }))
      : usage(supportsColor(), true));
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
      const createdWorkspace = await engine.createWorkspace({ root, name });
      result = createdWorkspace;
      await registerWorkspace({ id: createdWorkspace.workspaceId, name: createdWorkspace.name, root: createdWorkspace.root, updatedAt: new Date().toISOString() }, environment);
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
      const requestedWorkspace = option(args, "--workspace");
      const root = await resolveWorkspacePath(cwd, requestedWorkspace, environment);
      result = await engine.inspectWorkspace(root);
    } else if (args[0] === "module" && args[1] === "views") {
      command = "module.views";
      const requestedWorkspace = option(args, "--workspace");
      const root = await resolveWorkspacePath(cwd, requestedWorkspace, environment);
      const moduleId = option(args, "--module");
      if (!moduleId) throw new EngineError("InvalidInput", "module views requires --module.");
      result = await engine.listInstalledModuleViews(root, moduleId);
    } else if (args[0] === "records" && args[1] === "list") {
      command = "records.list";
      const requestedWorkspace = option(args, "--workspace");
      const root = await resolveWorkspacePath(cwd, requestedWorkspace, environment);
      const moduleId = option(args, "--module");
      if (moduleId === "aimoto.files" || moduleId === "aimoto.tasks") {
        if (option(args, "--collection")) {
          throw new EngineError("InvalidInput", "--collection is only used with custom modules.");
        }
        result = await engine.listBuiltInRecords(root, moduleId);
      } else if (moduleId) {
        const collectionId = option(args, "--collection");
        if (!collectionId) {
          throw new EngineError("InvalidInput", `records list for ${moduleId} requires --collection.`);
        }
        result = await engine.listInstalledModuleRecords(root, moduleId, collectionId);
      } else {
        throw new EngineError("InvalidInput", "records list requires a supported --module.");
      }
    } else if (args[0] === "habit" && args[1] === "create") {
      command = "habit.create";
      const requestedWorkspace = option(args, "--workspace");
      const root = await resolveWorkspacePath(cwd, requestedWorkspace, environment);
      const habitId = option(args, "--id");
      const name = option(args, "--name");
      if (!habitId || !name) throw new EngineError("InvalidInput", "habit create requires --id and --name.");
      result = await engine.executeHabitTrackerCommand({
        root, command: "create-habit", input: { habitId, name }
      });
    } else if (args[0] === "habit" && args[1] === "log") {
      command = "habit.log";
      const requestedWorkspace = option(args, "--workspace");
      const root = await resolveWorkspacePath(cwd, requestedWorkspace, environment);
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
      const requestedWorkspace = option(args, "--workspace");
      const root = await resolveWorkspacePath(cwd, requestedWorkspace, environment);
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
      const requestedWorkspace = option(args, "--workspace");
      const root = await resolveWorkspacePath(cwd, requestedWorkspace, environment, true);
      const agentMode = args.includes("--agent");
      result = await createOutcomeProposal(engine, root, request, requestedWorkspace,
        agentMode ? (dependencies.agentProvider ?? createCodexCliProvider({ env: environment })) : undefined);
    } else if (args[0] === "agent" && args[1] === "habit" && args[2] === "plan") {
      command = "agent.habit.plan";
      const requestedWorkspace = option(args, "--workspace");
      const root = await resolveWorkspacePath(cwd, requestedWorkspace, environment, true);
      const request = option(args, "--request") ?? "Add a Habit Tracker";
      result = await createOutcomeProposal(engine, root, request, requestedWorkspace);
    } else if (args[0] === "plan") {
      command = "plan";
      const requestedWorkspace = option(args, "--workspace");
      const root = await resolveWorkspacePath(cwd, requestedWorkspace, environment);
      const authorityMode = option(args, "--set-authority");
      if (!authorityMode) {
        throw new EngineError("InvalidInput", "plan requires --set-authority for this v0.1 slice.");
      }
      const validModes = ["observe", "suggest", "assist", "execute", "build"];
      if (!validModes.includes(authorityMode)) {
        throw new EngineError(
          "InvalidInput",
          `Invalid authority mode "${authorityMode}". Supported modes: ${validModes.join(", ")}.`
        );
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
      const requestedWorkspace = option(args, "--workspace");
      const root = await resolveWorkspacePath(cwd, requestedWorkspace, environment);
      const proposalId = option(args, "--proposal");
      const changeSetDigest = option(args, "--hash");
      if (!proposalId || !changeSetDigest) {
        throw new EngineError("InvalidInput", "apply requires --proposal and --hash.");
      }
      const proposal = engine.getProposal(root, proposalId);
      const principal = option(args, "--principal");
      const approved = await engine.approveProposal({
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
      result = approved;
    } else if (args[0] === "open") {
      command = "open";
      const requestedWorkspace = option(args, "--workspace");
      const root = await resolveWorkspacePath(cwd, requestedWorkspace, environment, true);
      const workspace = await engine.inspectWorkspace(root);
      const opened = await (dependencies.openDesktop ?? ((workspaceRoot) =>
        defaultOpenDesktop(workspaceRoot, environment, dependencies.runtimeExecutable)))(workspace.root);
      result = { ...opened, workspace };
    } else if (args[0] === "shortcut" && args[1] === "create") {
      command = "shortcut.create";
      const requestedWorkspace = option(args, "--workspace");
      const root = await resolveWorkspacePath(cwd, requestedWorkspace, environment, true);
      const workspace = await engine.inspectWorkspace(root);
      const shortcutPath = await createDesktopShortcut(workspace.name, workspace.root);
      result = { workspace, shortcutPath };
    } else {
      if (args.length === 0 || args[0] === "help" || args[0] === "--help") {
        io.stdout(wantsJson
          ? JSON.stringify(envelope("help", traceId, { data: { usage: usage(false, false), jsonEnvelopeVersion: JSON_ENVELOPE_VERSION } }))
          : usage(supportsColor(), true));
        return 0;
      }
      throw new EngineError(
        "InvalidInput",
        `Unknown command "${args[0]}". Run aimoto --help to see supported commands.`
      );
    }

    const requestedWorkspace = option(args, "--workspace");
    io.stdout(
      wantsJson
        ? JSON.stringify(envelope(command, traceId, { data: result }))
        : command === "agent.habit.plan" || command === "request"
          ? renderOutcomePlan(result as { request: string; workspaceRoot?: string; plan: { displayName: string; userOutcomes: string[] }; proposal: { proposalId: string; changeSetDigest: string; changeSet: ChangeSet } })
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
        : isWorkspaceInspection(result)
          ? renderInspection(result)
        : isProposal(result)
          ? renderProposal(result, requestedWorkspace)
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
