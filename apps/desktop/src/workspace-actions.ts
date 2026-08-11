import { access, realpath, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { relative, resolve, sep } from "node:path";

type ActionFailure = { ok: false; code: string; message: string };
export type WorkspaceActionResult = { ok: true; value: Record<string, unknown> } | ActionFailure;

type Runtime = "node" | "python" | "powershell";
type InputType = "string" | "number" | "boolean";
type ActionDefinition = {
  id: string;
  runtime: Runtime;
  script: string;
  timeoutMs?: number;
  input?: { required?: string[]; properties?: Record<string, InputType> };
};

const manifestName = "aimoto.actions.json";
const actionId = /^[a-z][a-z0-9.-]{2,63}$/;
const maxJsonBytes = 64 * 1024;

function failure(code: string, message: string): ActionFailure {
  return { ok: false, code, message };
}

function isFailure(value: unknown): value is ActionFailure {
  return isRecord(value) && value.ok === false && typeof value.code === "string" && typeof value.message === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isJson(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every(isJson);
  return isRecord(value) && Object.values(value).every(isJson);
}

function actionDefinition(value: unknown): ActionDefinition | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || !actionId.test(value.id) || typeof value.script !== "string") return undefined;
  if (value.runtime !== "node" && value.runtime !== "python" && value.runtime !== "powershell") return undefined;
  if (value.timeoutMs !== undefined && (typeof value.timeoutMs !== "number" || !Number.isInteger(value.timeoutMs) || value.timeoutMs < 100 || value.timeoutMs > 30_000)) return undefined;
  if (value.input !== undefined) {
    if (!isRecord(value.input)) return undefined;
    if (value.input.required !== undefined && (!Array.isArray(value.input.required) || !value.input.required.every((key) => typeof key === "string"))) return undefined;
    if (value.input.properties !== undefined && (!isRecord(value.input.properties) || !Object.values(value.input.properties).every((type) => type === "string" || type === "number" || type === "boolean"))) return undefined;
  }
  return value as ActionDefinition;
}

async function readAction(root: string, id: string): Promise<ActionDefinition | ActionFailure> {
  try {
    const parsed = JSON.parse(await readFile(resolve(root, manifestName), "utf8")) as unknown;
    if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !Array.isArray(parsed.actions)) return failure("ACTION_MANIFEST_INVALID", ` ${manifestName} must contain schemaVersion 1 and an actions array.`);
    const actions = parsed.actions.map(actionDefinition);
    if (actions.some((action) => !action)) return failure("ACTION_MANIFEST_INVALID", ` ${manifestName} contains an invalid action declaration.`);
    return actions.find((action) => action?.id === id) ?? failure("ACTION_NOT_DECLARED", `The workspace does not declare the action '${id}'.`);
  } catch {
    return failure("ACTION_MANIFEST_MISSING", `The workspace has no readable ${manifestName}.`);
  }
}

function validateInput(definition: ActionDefinition, input: unknown): Record<string, unknown> | ActionFailure {
  if (!isRecord(input) || !isJson(input)) return failure("ACTION_INPUT_INVALID", "Action input must be a JSON object.");
  const encoded = JSON.stringify(input);
  if (Buffer.byteLength(encoded, "utf8") > maxJsonBytes) return failure("ACTION_INPUT_TOO_LARGE", "Action input exceeds 64 KiB.");
  const schema = definition.input;
  if (!schema) return input;
  const properties = schema.properties ?? {};
  if (Object.keys(input).some((key) => !(key in properties))) return failure("ACTION_INPUT_INVALID", "Action input contains an undeclared field.");
  if ((schema.required ?? []).some((key) => !(key in input))) return failure("ACTION_INPUT_INVALID", "Action input is missing a required field.");
  if (Object.entries(input).some(([key, value]) => typeof value !== properties[key])) return failure("ACTION_INPUT_INVALID", "Action input has an invalid field type.");
  return input;
}

async function resolveHandler(root: string, definition: ActionDefinition): Promise<string | ActionFailure> {
  const extension = definition.runtime === "node" ? ".mjs" : definition.runtime === "python" ? ".py" : ".ps1";
  if (!definition.script.endsWith(extension)) return failure("ACTION_HANDLER_INVALID", `A ${definition.runtime} action must declare a ${extension} handler.`);
  try {
    const canonicalRoot = await realpath(root);
    const handler = await realpath(resolve(canonicalRoot, definition.script));
    const pathFromRoot = relative(canonicalRoot, handler);
    if (!pathFromRoot || pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || pathFromRoot.includes(`${sep}.aimoto${sep}`)) return failure("ACTION_HANDLER_INVALID", "Action handlers must remain inside the workspace and outside .aimoto.");
    await access(handler);
    return handler;
  } catch {
    return failure("ACTION_HANDLER_MISSING", "The declared action handler is missing or outside the workspace.");
  }
}

function commandFor(definition: ActionDefinition, handler: string): { executable: string; args: string[]; environment?: NodeJS.ProcessEnv } | ActionFailure {
  if (definition.runtime === "node") return { executable: process.execPath, args: [handler], environment: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } };
  if (definition.runtime === "python") return { executable: "python", args: [handler] };
  if (process.platform !== "win32") return failure("ACTION_PLATFORM_UNSUPPORTED", "PowerShell actions are supported only on Windows.");
  return { executable: "powershell.exe", args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", handler] };
}

/** Runs one manifest-declared workspace handler. It never evaluates a command supplied by a workspace UI. */
export async function invokeWorkspaceAction(root: string, action: string, input: unknown): Promise<WorkspaceActionResult> {
  if (!actionId.test(action)) return failure("ACTION_NAME_INVALID", "Action names must use lowercase letters, numbers, dots, and hyphens.");
  const definition = await readAction(root, action);
  if (isFailure(definition)) return definition;
  const validInput = validateInput(definition, input);
  if (isFailure(validInput)) return validInput;
  const handler = await resolveHandler(root, definition);
  if (isFailure(handler)) return handler;
  const command = commandFor(definition, handler);
  if (isFailure(command)) return command;

  return new Promise((resolveResult) => {
    const child = spawn(command.executable, command.args, { cwd: root, shell: false, windowsHide: true, env: command.environment ?? process.env, stdio: ["pipe", "pipe", "pipe"] });
    const timeout = setTimeout(() => { child.kill(); resolveResult(failure("ACTION_TIMED_OUT", "The action did not finish within its declared time limit.")); }, definition.timeoutMs ?? 10_000);
    let stdout = "";
    let stderr = "";
    const append = (target: "stdout" | "stderr", chunk: Buffer) => {
      const next = (target === "stdout" ? stdout : stderr) + chunk.toString("utf8");
      if (target === "stdout") stdout = next.slice(0, maxJsonBytes + 1); else stderr = next.slice(0, maxJsonBytes + 1);
    };
    child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));
    child.on("error", () => { clearTimeout(timeout); resolveResult(failure("ACTION_START_FAILED", "The declared action could not start.")); });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (Buffer.byteLength(stdout, "utf8") > maxJsonBytes || Buffer.byteLength(stderr, "utf8") > maxJsonBytes) return resolveResult(failure("ACTION_OUTPUT_TOO_LARGE", "The action returned more than 64 KiB of output."));
      if (code !== 0) return resolveResult(failure("ACTION_FAILED", "The declared action returned a failure result."));
      try {
        const value = JSON.parse(stdout) as unknown;
        resolveResult(isRecord(value) ? { ok: true, value } : failure("ACTION_OUTPUT_INVALID", "The action must write one JSON object to standard output."));
      } catch {
        resolveResult(failure("ACTION_OUTPUT_INVALID", "The action must write one JSON object to standard output."));
      }
    });
    child.stdin.end(JSON.stringify(validInput));
  });
}
