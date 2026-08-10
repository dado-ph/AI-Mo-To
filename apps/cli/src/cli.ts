import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

import { EngineError, WorkspaceEngine, type ImplementationBrief, type WorkspaceInspection } from "@ai-mo-to/engine";
import { JSON_ENVELOPE_VERSION, validateProtocol, type JsonEnvelope, type WorkspaceVersion } from "@ai-mo-to/protocol";

import { registerWorkspace, resolveRegisteredWorkspace } from "./workspace-registry.js";

const execFileAsync = promisify(execFile);

export interface CliIo {
  stdout(message: string): void;
  stderr(message: string): void;
}

type DoctorCheck = {
  id: string;
  ok: boolean;
  detail: string;
  remediation?: string;
  evidence?: Record<string, unknown>;
};

export interface CliDependencies {
  engine?: WorkspaceEngine;
  cwd?: string;
  traceId?: () => string;
  platform?: NodeJS.Platform;
  nodeVersion?: string;
  environment?: NodeJS.ProcessEnv;
  runtimeExecutable?: string;
  openDesktop?: (workspaceRoot: string) => Promise<{ launched: boolean; executable: string }>;
  doctorBootstrapProbe?: (engine: WorkspaceEngine) => Promise<DoctorCheck>;
}

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
  } catch {
    // Return the intended path so callers can report it consistently.
  }
  return shortcutPath;
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

function normalizeCliError(error: unknown): EngineError {
  if (error instanceof EngineError && error.code !== "InternalError") return error;
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
  const named = error instanceof Error ? error.name : undefined;
  const failure = (
    engineCode: ConstructorParameters<typeof EngineError>[0],
    message: string,
    details: SafeFailureDetails
  ) => new EngineError(engineCode, message, details);

  if (code === "ENOENT" || code === "ERR_MODULE_NOT_FOUND") {
    return failure("ResourceNotFound", "A required local resource was not found.", {
      category: "resource", retryable: false, remediation: "Verify the workspace or installation, then run aimoto doctor."
    });
  }
  if (code === "EACCES" || code === "EPERM" || code === "EROFS") {
    return failure("FilesystemAccessDenied", "AI-Mo-To could not access a required local resource.", {
      category: "filesystem", retryable: false, remediation: "Check the current user's permissions and whether the location is read-only."
    });
  }
  if (code === "EBUSY" || code === "ETXTBSY" || code === "SQLITE_BUSY" || code === "SQLITE_LOCKED") {
    return failure("ResourceBusy", "A required local resource is currently in use.", {
      category: "resource", retryable: true, remediation: "Close other processes using the workspace and retry."
    });
  }
  if (named === "SyntaxError" || code === "SQLITE_CORRUPT" || code === "SQLITE_NOTADB") {
    return failure("SchemaInvalid", "Stored workspace data is malformed or incompatible.", {
      category: "schema", retryable: false, remediation: "Run aimoto doctor and restore from a verified version if available."
    });
  }
  if (code === "SQLITE_CANTOPEN" || code === "ERR_DLOPEN_FAILED") {
    return failure("BootstrapFailed", "A required AI-Mo-To runtime component could not start.", {
      category: "bootstrap", retryable: false, remediation: "Run aimoto doctor; reinstall AI-Mo-To if the installation check fails."
    });
  }
  return failure("InternalError", "The command could not be completed.", {
    category: "internal", retryable: false, remediation: "Retry once, then run aimoto doctor and report the traceId if the failure continues."
  });
}

function envelope<T>(
  command: string,
  traceId: string,
  result: { data: T } | { error: NonNullable<JsonEnvelope<T>["error"]> }
): JsonEnvelope<T> {
  const value: JsonEnvelope<T> = "data" in result
    ? { envelopeVersion: JSON_ENVELOPE_VERSION, ok: true, command, traceId, data: result.data }
    : { envelopeVersion: JSON_ENVELOPE_VERSION, ok: false, command, traceId, error: result.error };
  const validation = validateProtocol("json-envelope", value);
  if (!validation.valid) throw new Error("The CLI produced an invalid JSON envelope.");
  return value;
}

function usage(): string {
  return [
    "AI-Mo-To CLI",
    "Create a local workspace, hand implementation to an agent, and capture user-approved versions.",
    "",
    "Commands:",
    '  aimoto init "<name>" [--root <path>] [--json]',
    '  aimoto workspace create "<name>" [--root <path>] [--json]',
    '  aimoto request "<plan or need>" --workspace <path> [--json]',
    "  aimoto inspect [--workspace <path>] [--json]",
    '  aimoto version create --workspace <path> --message "<user-approved summary>" [--json]',
    "  aimoto version list --workspace <path> [--json]",
    "  aimoto version restore <version-id> --workspace <path> [--json]",
    "  aimoto doctor [--workspace <path>] [--json]",
    "  aimoto open [--workspace <path>] [--json]",
    "",
    "Agent contract:",
    "  request returns an implementation brief and does not implement or version changes.",
    "  Run version create only after the agent receives explicit user confirmation.",
    "  Add --json for one versioned envelope on stdout. Never parse human output."
  ].join("\n");
}

export function desktopExecutableCandidates(environment: NodeJS.ProcessEnv, runtimeExecutable?: string): string[] {
  return [
    runtimeExecutable,
    environment.AIMOTO_DESKTOP_PATH,
    environment.LOCALAPPDATA ? resolve(environment.LOCALAPPDATA, "Programs", "AI-Mo-To", "AI-Mo-To.exe") : undefined
  ].filter((candidate, index, values): candidate is string => Boolean(candidate) && values.indexOf(candidate) === index);
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
      const child = spawn(executable, ["--workspace", workspaceRoot], { detached: true, stdio: "ignore", windowsHide: false });
      child.unref();
      return { launched: true, executable };
    } catch {
      // Try the next known installation location.
    }
  }
  throw new EngineError("InvalidInput", "AI-Mo-To Desktop was not found. Install it or set AIMOTO_DESKTOP_PATH to AI-Mo-To.exe.", {
    checked: candidates
  });
}

export async function findWorkspaceDirectory(startDir: string): Promise<string | undefined> {
  let current = resolve(startDir);
  while (true) {
    try {
      await access(join(current, ".aimoto", "workspace.json"));
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) return undefined;
      current = parent;
    }
  }
}

export async function resolveWorkspacePath(
  cwd: string,
  requestedWorkspace?: string,
  environment: NodeJS.ProcessEnv = process.env,
  fallbackToDefault = false
): Promise<string> {
  if (requestedWorkspace) {
    return (await resolveRegisteredWorkspace(requestedWorkspace, environment)) ?? resolve(cwd, requestedWorkspace);
  }
  if (environment.AIMOTO_WORKSPACE) return resolve(cwd, environment.AIMOTO_WORKSPACE);
  const found = await findWorkspaceDirectory(cwd);
  if (found) return found;
  const registered = await resolveRegisteredWorkspace("default", environment);
  if (registered) return registered;
  if (fallbackToDefault) {
    return environment.LOCALAPPDATA
      ? resolve(environment.LOCALAPPDATA, "AI-Mo-To", "workspaces", "default")
      : resolve(homedir(), ".aimoto", "workspaces", "default");
  }
  return resolve(cwd);
}

export async function ensureWorkspaceResolved(engine: WorkspaceEngine, root: string): Promise<string> {
  try {
    await engine.inspectWorkspace(root);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "WorkspaceNotFound") {
      const name = basename(root) || "Default Workspace";
      await engine.createWorkspace({ root, name });
    } else {
      throw error;
    }
  }
  return root;
}

async function probeWorkspaceBootstrap(engine: WorkspaceEngine): Promise<DoctorCheck> {
  let probeDirectory: string | undefined;
  try {
    probeDirectory = await mkdtemp(join(tmpdir(), "aimoto-doctor-"));
    const root = join(probeDirectory, "workspace");
    const created = await engine.createWorkspace({ root, name: "AI-Mo-To Doctor Probe", workspaceId: "aimoto-doctor-probe" });
    const inspected = await engine.inspectWorkspace(root);
    const ok = created.revision === 0 && inspected.revision === 0 && inspected.currentVersionId === null && inspected.health === "ok";
    return {
      id: "bootstrap",
      ok,
      detail: ok ? "Created, persisted, and inspected a blank disposable workspace." : "The disposable workspace metadata was incomplete.",
      ...(!ok ? { remediation: "Reinstall AI-Mo-To so the CLI and workspace schema come from the same release." } : {}),
      evidence: { revision: inspected.revision, currentVersionId: inspected.currentVersionId, health: inspected.health }
    };
  } catch (error) {
    const diagnosed = normalizeCliError(error);
    return {
      id: "bootstrap", ok: false, detail: `${diagnosed.code}: ${diagnosed.message}`,
      remediation: "Verify the installation, then reinstall AI-Mo-To and run aimoto doctor again."
    };
  } finally {
    if (probeDirectory) await rm(probeDirectory, { recursive: true, force: true });
  }
}

function renderInspection(inspection: WorkspaceInspection): string {
  return [
    `${inspection.name} (${inspection.workspaceId})`,
    `Root: ${inspection.root}`,
    `Revision: ${inspection.revision}`,
    `Current version: ${inspection.currentVersionId ?? "none"}`,
    `Health: ${inspection.health}`
  ].join("\n");
}

function renderImplementationBrief(brief: ImplementationBrief): string {
  return [
    `Implementation brief for ${brief.workspaceId}`,
    `Workspace root: ${brief.workspaceRoot}`,
    `Request: ${brief.request}`,
    "",
    brief.instructions
  ].join("\n");
}

function renderVersion(version: WorkspaceVersion, restored = false): string {
  return [
    restored ? `Restored ${version.parentVersionId} as version ${version.versionId}.` : `Created version ${version.versionId}.`,
    `Revision: ${version.revision}`,
    `Message: ${version.message}`
  ].join("\n");
}

export async function runCli(args: string[], io: CliIo, dependencies: CliDependencies = {}): Promise<number> {
  const engine = dependencies.engine ?? new WorkspaceEngine();
  const cwd = dependencies.cwd ?? process.cwd();
  const traceId = (dependencies.traceId ?? randomUUID)();
  const wantsJson = args.includes("--json");
  const environment = dependencies.environment ?? process.env;
  let command = args[0] ?? "help";

  if (args.includes("--help") || args.length === 0 || args[0] === "help") {
    io.stdout(wantsJson
      ? JSON.stringify(envelope("help", traceId, {
          data: {
            summary: "Create a workspace, hand implementation to an agent, and capture explicit versions.",
            usage: usage(),
            jsonEnvelopeVersion: JSON_ENVELOPE_VERSION,
            approvalRule: "Run version create only after explicit user confirmation."
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
      if (!name || name.startsWith("--")) throw new EngineError("InvalidInput", `${args[0] === "init" ? "init" : "workspace create"} requires a name.`);
      const root = resolve(cwd, option(args, "--root") ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
      const created = await engine.createWorkspace({ root, name });
      await registerWorkspace({ id: created.workspaceId, name: created.name, root: created.root, updatedAt: new Date().toISOString() }, environment);
      result = created;
    } else if (args[0] === "inspect") {
      command = "inspect";
      result = await engine.inspectWorkspace(await resolveWorkspacePath(cwd, option(args, "--workspace"), environment));
    } else if (args[0] === "request") {
      command = "request";
      if (args.includes("--agent")) {
        throw new EngineError("InvalidInput", "request --agent is no longer supported; use the returned implementation brief in the current coding-agent session.");
      }
      const request = args[1];
      if (!request || request.startsWith("--")) {
        throw new EngineError("InvalidInput", 'request requires a need, for example: aimoto request "Build a garden planner" --workspace <path>');
      }
      const root = await resolveWorkspacePath(cwd, option(args, "--workspace"), environment, true);
      await ensureWorkspaceResolved(engine, root);
      result = { implementationBrief: await engine.prepareImplementationRequest({ root, request }) };
    } else if (args[0] === "version") {
      const action = args[1];
      command = `version.${action ?? "unknown"}`;
      const root = await resolveWorkspacePath(cwd, option(args, "--workspace"), environment);
      if (action === "create") {
        const message = option(args, "--message")?.trim();
        if (!message) throw new EngineError("InvalidInput", "version create requires --message with the user-approved summary.");
        result = {
          explicitUserConfirmationRequired: true,
          approvalRequirement: "Run this command only after the agent receives explicit user confirmation.",
          version: await engine.createWorkspaceVersion({ root, message })
        };
      } else if (action === "list") {
        result = { versions: await engine.listWorkspaceVersions(root) };
      } else if (action === "restore") {
        const versionId = args[2];
        if (!versionId || versionId.startsWith("--")) throw new EngineError("InvalidInput", "version restore requires a version id.");
        result = { version: await engine.restoreWorkspaceVersion(root, versionId) };
      } else {
        throw new EngineError("InvalidInput", "version requires create, list, or restore.");
      }
    } else if (args[0] === "doctor") {
      command = "doctor";
      const platform = dependencies.platform ?? process.platform;
      const nodeVersion = dependencies.nodeVersion ?? process.versions.node;
      const major = Number.parseInt(nodeVersion.split(".")[0] ?? "0", 10);
      const bootstrap = await (dependencies.doctorBootstrapProbe ?? probeWorkspaceBootstrap)(engine);
      const checks: DoctorCheck[] = [
        { id: "node", ok: major >= 22, detail: `Node.js ${nodeVersion}; 22 or newer is required.` },
        { id: "platform", ok: platform === "win32", detail: `${platform}; the installable desktop currently targets Windows.` },
        bootstrap
      ];
      result = { healthy: checks.every((check) => check.ok), checks };
    } else if (args[0] === "open") {
      command = "open";
      const root = await resolveWorkspacePath(cwd, option(args, "--workspace"), environment, true);
      const workspace = await engine.inspectWorkspace(root);
      const opened = await (dependencies.openDesktop ?? ((workspaceRoot) => defaultOpenDesktop(workspaceRoot, environment, dependencies.runtimeExecutable)))(workspace.root);
      result = { ...opened, workspace };
    } else if (args[0] === "shortcut" && args[1] === "create") {
      command = "shortcut.create";
      const root = await resolveWorkspacePath(cwd, option(args, "--workspace"), environment, true);
      const workspace = await engine.inspectWorkspace(root);
      result = { workspace, shortcutPath: await createDesktopShortcut(workspace.name, workspace.root) };
    } else {
      throw new EngineError("InvalidInput", `Unknown command "${args[0]}". Run aimoto --help to see supported commands.`);
    }

    if (wantsJson) {
      io.stdout(JSON.stringify(envelope(command, traceId, { data: result })));
    } else if (command === "request") {
      io.stdout(renderImplementationBrief((result as { implementationBrief: ImplementationBrief }).implementationBrief));
    } else if (command === "version.create") {
      io.stdout(renderVersion((result as { version: WorkspaceVersion }).version));
    } else if (command === "version.restore") {
      io.stdout(renderVersion((result as { version: WorkspaceVersion }).version, true));
    } else if (command === "version.list") {
      const versions = (result as { versions: readonly WorkspaceVersion[] }).versions;
      io.stdout(versions.length === 0 ? "No versions have been created." : versions.map((version) => `${version.versionId}  r${version.revision}  ${version.message}`).join("\n"));
    } else if (command === "doctor") {
      io.stdout((result as { checks: DoctorCheck[] }).checks.map((check) => `${check.ok ? "PASS" : "FAIL"} ${check.id}: ${check.detail}`).join("\n"));
    } else if (command === "open") {
      io.stdout(`Opened AI-Mo-To Desktop for ${(result as { workspace: WorkspaceInspection }).workspace.name}.`);
    } else if (typeof result === "object" && result !== null && "health" in result) {
      io.stdout(renderInspection(result as WorkspaceInspection));
    } else {
      io.stdout(JSON.stringify(result, null, 2));
    }
    return command === "doctor" && !(result as { healthy: boolean }).healthy ? 1 : 0;
  } catch (error) {
    const engineError = normalizeCliError(error);
    const output = envelope(command, traceId, {
      error: {
        code: engineError.code,
        message: engineError.message,
        ...(engineError.details ? { details: engineError.details } : {})
      }
    });
    if (wantsJson) io.stdout(JSON.stringify(output));
    else io.stderr(`${engineError.code}: ${engineError.message}`);
    return engineError.code === "InternalError" ? 1 : 2;
  }
}
