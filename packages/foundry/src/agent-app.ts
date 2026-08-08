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

export const DEFAULT_AGENT_GUIDE = `# AI-Mo-To Foundry — Practice Makes Perfect (PMP) Guide

You are building a local application for a user in the supplied repository using the **Practice Makes Perfect (PMP)** workflow.

## 🎯 Architecture Principles

1. **Python for Automation & Logic (The Muscles):** Write clean Python backend scripts (\`scripts/*.py\`) for computer-use tasks, local data processing, filesystem operations, and calculations.
2. **Shadcn HTML UI (The Face):** Build a self-contained, responsive HTML/CSS/JS entrypoint (\`ui/index.html\`) composed with Shadcn UI styling tokens (\`--background\`, \`--foreground\`, \`--primary\`, \`--card\`, \`--radius\`).
3. **UI Action Callbacks:** Connect UI controls (button clicks, form submits) to execute the background Python scripts via the AI-Mo-To bridge or \`exec.python\` capability.
4. **Empirical Rehearsal:** Before reporting completion, run local validation and verify that \`ui/index.html\` exists on disk, renders interactive controls, and that Python backend scripts execute cleanly without runtime errors. Do not return mockups, documentation summaries, or empty JSON declarations.

## 📄 Streamlined Module Manifest (\`module.json\`)

Create a clean, functional \`module.json\` manifest:

\`\`\`json
{
  "schemaVersion": "1.0.0",
  "moduleId": "local.descriptive-app-id",
  "name": "Human-readable app name",
  "version": "1.0.0",
  "trustTier": "local-generated",
  "entry": "ui/index.html",
  "scripts": ["scripts/handler.py"],
  "capabilities": ["storage.local", "exec.python"]
}
\`\`\`

- \`schemaVersion\` is "1.0.0".
- \`moduleId\` is a unique lowercase identifier (e.g. \`local.task-tracker\`).
- \`entry\` points directly to your primary UI HTML file (\`ui/index.html\`).
- \`scripts\` lists executable Python script handlers for UI callbacks.
- Declare all required capabilities in \`capabilities\` before using them.

If a workspace layout is customized, put it in a separate \`aimoto.workspace.json\` file:
\`\`\`json
{
  "layout": {
    "homeView": "local.descriptive-app-id",
    "views": [
      { "id": "local.descriptive-app-id", "moduleId": "local.descriptive-app-id", "viewId": "main" }
    ]
  }
}
\`\`\`

Do not access or modify any repository outside this app repository. Run project validation commands before reporting completion.`;

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
