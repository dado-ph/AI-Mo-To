import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";

/** A provider-neutral description of an isolated app workspace for a coding agent. */
export interface AgentAppRepository {
  appId: string;
  root: string;
  promptFile: string;
  manifestFile: string;
}

/**
 * Allocate the only writable area an external coding agent should receive.
 * The product repository is deliberately not involved in this operation.
 */
export async function allocateAgentAppRepository(
  storageRoot: string,
  appId: string,
  request: string,
  foundryGuide: string,
): Promise<AgentAppRepository> {
  const root = resolve(storageRoot, "apps", appId);
  await mkdir(root, { recursive: true });
  const promptFile = join(root, "FOUNDRY_PROMPT.md");
  const manifestFile = join(root, "aimoto.app.json");
  await writeFile(promptFile, foundryGuide.trim() + `\n\n## User request\n\n${request.trim()}\n`, "utf8");
  await writeFile(manifestFile, JSON.stringify({
    schemaVersion: 1,
    appId,
    request,
    status: "building",
    sourceRoot: root,
    capabilities: [],
  }, null, 2) + "\n", "utf8");
  return { appId, root, promptFile, manifestFile };
}

/** Stable instructions shared by Codex CLI and future provider adapters. */
export const DEFAULT_AGENT_GUIDE = `# AI-Mo-To Foundry
You are building an application for one user in the supplied repository.
Use the repository's configured stack and create source code, tests, and a runnable UI.
Treat this guide as design and engineering guidance, not as a catalogue of application types.
Infer the workflow from the request, handle loading/empty/error/cancel states, and make controls accessible.
Leverage shadcn-inspired UI component primitives (Button, Card, Dialog, Input, Badge, Table, Tabs) and author a visual aesthetic (color palette, typography, layout) that fits the user's intent using standard CSS token variable slots (--background, --foreground, --primary, --card, --radius).
Produce an AI-Mo-To module.json that satisfies the module-manifest contract, including capabilities as unique strings.
Use this exact shape (replace the identifiers and names, but do not add undeclared top-level properties):
\`\`\`json
{
  "schemaVersion": "1.0.0",
  "moduleId": "local.descriptive-app-id",
  "name": "Human-readable app name",
  "version": "1.0.0",
  "trustTier": "local-generated",
  "collections": [],
  "views": [
    { "id": "main", "kind": "app", "declaration": "views/main.view.json" }
  ],
  "commands": [],
  "events": [],
  "capabilities": ["storage.local"],
  "migrations": []
}
\`\`\`
schemaVersion is the string "1.0.0"; the identity field is moduleId, not id. All nine required arrays must be present. Top-level description and requestedCapabilities are not part of this strict manifest.
The primary user-facing view should normally use kind "app". Its in-bundle JSON declaration must contain {"title":"...","kind":"app","entry":"ui/index.html"}. Build that entry as a self-contained, functional HTML/CSS/JavaScript application: controls must perform the requested workflow, cancellation or stopping must work when relevant, state must visibly update, and user state must persist across reloads using a module-namespaced localStorage key. Do not return a mockup, documentation page, summary card, or nonfunctional controls. Do not depend on a development server or network-hosted scripts.
Every view must have an id, kind, and an in-bundle JSON declaration path; keep declarations and entrypoints inside this repository. If the workspace layout is customized, put it in a separate aimoto.workspace.json file with layout.homeView and layout.views using those module view ids.
For a single main view, use:
\`\`\`json
{
  "layout": {
    "homeView": "app.main",
    "views": [
      { "id": "app.main", "moduleId": "local.descriptive-app-id", "viewId": "main" }
    ]
  }
}
\`\`\`
Do not access or modify any repository outside this app repository. Declare capabilities before using them.
Run the project's validation commands before reporting completion.
Do not merely explain, propose, or print the files in your response. Create them in the supplied repository. Before you finish, verify that module.json, aimoto.workspace.json, the declared view JSON, and the declared HTML entrypoint all exist on disk and that the application tests pass.`;

export interface AgentProvider {
  name: string;
  run(input: { repositoryRoot: string; promptFile: string }): Promise<{ exitCode: number; output?: string }>;
}

/** Provider for the locally installed Codex CLI. The child process is scoped to
 * the generated repository and receives the Foundry prompt over stdin. */
export function createCodexCliProvider(options: {
  command?: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
} = {}): AgentProvider {
  const command = options.command ?? process.env.AIMOTO_CODEX_COMMAND ?? "codex";
  // Keep the agent writable only within the generated repository while
  // avoiding unsupported convenience flags that vary across Codex versions.
  // Keep the invocation compatible with the installed Codex CLI. `workspace-write`
  // confines generated edits to the isolated app repository; this Codex version
  // does not support the newer `--ask-for-approval` flag.
  const args = options.args ?? [
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "--ignore-rules",
    "--color",
    "never",
    "--sandbox",
    "workspace-write",
    "-"
  ];
  return {
    name: "codex-cli",
    run: async ({ repositoryRoot, promptFile }) => {
      const prompt = await readFile(promptFile, "utf8");
      return new Promise((resolve) => {
        const child = spawn(command, args, {
          cwd: repositoryRoot,
          env: { ...process.env, ...options.env, AI_MO_TO_APP_ROOT: repositoryRoot },
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        });
        let output = "";
        child.stdout.on("data", chunk => { output += chunk.toString(); });
        child.stderr.on("data", chunk => { output += chunk.toString(); });
        child.on("error", error => resolve({ exitCode: 1, output: `${output}${error.message}` }));
        child.on("close", code => resolve({ exitCode: code ?? 1, output }));
        child.stdin.end(prompt);
      });
    },
  };
}

/** Execute a provider without ever changing the caller's working directory. */
export async function runAgent(provider: AgentProvider, app: AgentAppRepository): Promise<{ exitCode: number; output?: string }> {
  return provider.run({ repositoryRoot: app.root, promptFile: app.promptFile });
}
