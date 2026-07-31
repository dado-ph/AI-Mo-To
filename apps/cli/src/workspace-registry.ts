import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type WorkspaceRegistration = { id: string; name: string; root: string; updatedAt: string };

function defaultRoot(environment: NodeJS.ProcessEnv): string {
  return environment.LOCALAPPDATA
    ? join(environment.LOCALAPPDATA, "AI-Mo-To", "workspaces")
    : join(homedir(), ".aimoto", "workspaces");
}

export function workspaceRegistryPath(environment: NodeJS.ProcessEnv = process.env): string {
  return join(defaultRoot(environment), "registry.json");
}

export async function readWorkspaceRegistry(environment: NodeJS.ProcessEnv = process.env): Promise<WorkspaceRegistration[]> {
  try {
    const parsed = JSON.parse(await readFile(workspaceRegistryPath(environment), "utf8")) as { workspaces?: WorkspaceRegistration[] };
    return Array.isArray(parsed.workspaces) ? parsed.workspaces : [];
  } catch { return []; }
}

export async function registerWorkspace(entry: WorkspaceRegistration, environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const path = workspaceRegistryPath(environment);
  await mkdir(defaultRoot(environment), { recursive: true });
  const current = (await readWorkspaceRegistry(environment)).filter(item => item.id !== entry.id && resolve(item.root) !== resolve(entry.root));
  await writeFile(path, JSON.stringify({ version: 1, workspaces: [...current, entry] }, null, 2) + "\n", "utf8");
}

export async function resolveRegisteredWorkspace(value: string, environment: NodeJS.ProcessEnv = process.env): Promise<string | undefined> {
  const normalized = value.toLowerCase();
  const entry = (await readWorkspaceRegistry(environment)).find(item => item.id.toLowerCase() === normalized || item.name.toLowerCase() === normalized || resolve(item.root) === resolve(value));
  if (entry) { try { await access(join(entry.root, ".aimoto", "workspace.json")); return entry.root; } catch {} }
  return undefined;
}
