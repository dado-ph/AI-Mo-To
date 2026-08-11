import { access, readFile, readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

export type UiVerificationIssue = {
  code: string;
  message: string;
  remediation: string;
  standard: string;
};

export type UiVerificationReport = {
  ok: boolean;
  issues: readonly UiVerificationIssue[];
};

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function sourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, encoding: "utf8" });
  return entries
    .filter((entry) => /\.(?:tsx|ts|jsx|js|html)$/.test(entry))
    .filter((entry) => !entry.split(/[\\/]/).some((part) => part === ".aimoto" || part === "node_modules" || part === "dist" || part === "build"))
    .map((entry) => join(root, entry));
}

async function requiresHostAction(root: string): Promise<boolean> {
  try {
    const requirements = JSON.parse(await readFile(join(root, ".aimoto", "implementation-requirements.json"), "utf8")) as { schemaVersion?: unknown; requiresHostAction?: unknown };
    return requirements.schemaVersion === 1 && requirements.requiresHostAction === true;
  } catch { return false; }
}

async function verifyDeclaredActions(root: string, report: (code: string, message: string, remediation: string, standard: string) => void): Promise<boolean> {
  const manifestPath = join(root, "aimoto.actions.json");
  if (!await exists(manifestPath)) {
    report("HOST_ACTION_DECLARATION_MISSING", "This request requires a host action, but the workspace has no aimoto.actions.json declaration.", "Declare the named action and its handler; do not replace it with browser-only behavior.", "AI-Mo-To host action contract");
    return false;
  }
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { schemaVersion?: unknown; actions?: unknown };
    if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.actions) || manifest.actions.length === 0) throw new Error();
    for (const action of manifest.actions as Array<{ id?: unknown; runtime?: unknown; script?: unknown }>) {
      if (typeof action.id !== "string" || typeof action.script !== "string" || !["node", "python", "powershell"].includes(String(action.runtime))) throw new Error();
      const handler = resolve(root, action.script);
      const pathFromRoot = relative(resolve(root), handler);
      if (!pathFromRoot || pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || !pathFromRoot.startsWith(`scripts${sep}`) || !await exists(handler)) throw new Error();
    }
    return true;
  } catch {
    report("HOST_ACTION_DECLARATION_INVALID", "The host-action declaration is malformed or does not point to a handler below scripts/.", "Repair aimoto.actions.json so every action has a supported runtime and an existing scripts/ handler.", "AI-Mo-To host action contract");
    return false;
  }
}

/**
 * Checks the minimum contract for an agent-built interactive workspace. The
 * diagnostics are deliberately written for the agent to fix on its next turn.
 */
export async function verifyWorkspaceUi(root: string): Promise<UiVerificationReport> {
  const issues: UiVerificationIssue[] = [];
  const report = (code: string, message: string, remediation: string, standard: string) =>
    issues.push({ code, message, remediation, standard });

  const componentsJson = join(root, "components.json");
  if (!await exists(componentsJson)) {
    report("UI_SHADCN_CONFIG_MISSING", "This workspace has no components.json, so it is not a configured Shadcn application.", "Initialize Shadcn for the workspace and commit components.json with CSS variables enabled.", "Shadcn installation contract");
  } else {
    const raw = await readFile(componentsJson, "utf8");
    try {
      const config = JSON.parse(raw) as { tailwind?: { cssVariables?: boolean }; aliases?: { ui?: string; utils?: string } };
      if (config.tailwind?.cssVariables !== true) report("UI_SHADCN_TOKENS_MISSING", "Shadcn CSS variables are not enabled.", "Enable tailwind.cssVariables so components use semantic design tokens instead of one-off colors.", "Shadcn theming");
      if (!config.aliases?.ui || !config.aliases?.utils) report("UI_SHADCN_ALIASES_MISSING", "Shadcn UI or utility aliases are missing.", "Configure aliases.ui and aliases.utils, then import generated components and cn() through them.", "Shadcn installation contract");
    } catch {
      report("UI_SHADCN_CONFIG_INVALID", "components.json is not valid JSON.", "Repair components.json before continuing; the Shadcn CLI must be able to read it.", "Shadcn installation contract");
    }
  }

  const cnPath = join(root, "src", "lib", "utils.ts");
  const cnSource = await exists(cnPath) ? await readFile(cnPath, "utf8") : "";
  if (!/\bfunction\s+cn\b|\bconst\s+cn\b/.test(cnSource) || !/twMerge/.test(cnSource) || !/clsx/.test(cnSource)) {
    report("UI_CN_UTILITY_MISSING", "The required cn() utility is absent or is not composed from clsx and tailwind-merge.", "Add src/lib/utils.ts using clsx plus twMerge, then use cn() for conditional component classes.", "Shadcn utility contract");
  }

  const uiDirectory = join(root, "src", "components", "ui");
  if (!await exists(uiDirectory)) report("UI_SHADCN_COMPONENTS_MISSING", "No generated Shadcn component source exists under src/components/ui.", "Add the primitives this interface needs, such as Button, Card, Checkbox, Alert, Tooltip, and Dialog.", "Shadcn component contract");

  const files = await sourceFiles(root);
  const sources = await Promise.all(files.map(async (file) => ({ file, text: await readFile(file, "utf8") })));
  const allSource = sources.map(({ text }) => text).join("\n");
  if (await requiresHostAction(root)) {
    const declared = await verifyDeclaredActions(root, report);
    const callsBridge = /aimoto\.workspace-action/.test(allSource);
    if (!callsBridge) report("HOST_ACTION_BRIDGE_UNUSED", "This request requires a host action, but the page does not call the workspace-action bridge.", "Send a named aimoto.workspace-action message and render the returned result.", "AI-Mo-To host action contract");
    if (!declared && /localStorage|showModal|<dialog|alert\s*\(/.test(allSource)) report("HOST_ACTION_BROWSER_SUBSTITUTE", "The workspace appears to substitute browser-only behavior for a requested host action.", "Remove the substitute and connect the declared handler through the workspace-action bridge.", "AI-Mo-To host action contract");
  }
  if (!/components\/ui\//.test(allSource)) report("UI_SHADCN_UNUSED", "The application does not import a Shadcn component.", "Replace hand-written controls and panels with the appropriate generated Shadcn primitives.", "Shadcn component contract");
  if (!/\bcn\s*\(/.test(allSource)) report("UI_CN_UNUSED", "The application never calls cn().", "Use cn() where a component has conditional state, density, intent, or responsive classes.", "Shadcn utility contract");
  if (/error\.message/.test(allSource) || /Failed to fetch/.test(allSource)) report("UI_RAW_TRANSPORT_ERROR", "The UI can expose a raw transport error to the person using it.", "Map failures to an understandable state, cause, recovery action, and retry control; never render error.message directly.", "WCAG 2.2 SC 4.1.3 Status Messages");
  if (/on(?:Mouse|Pointer)Down\s*=/.test(allSource)) report("UI_DOWN_EVENT_ACTION", "A pointer-down handler was found and may execute an action before the pointer can be cancelled.", "Use normal button activation, or provide abort/undo before committing the action.", "WCAG 2.2 SC 2.5.2 Pointer Cancellation");
  if (/onDrag(?:Start|Over|Enter|End)\s*=/.test(allSource) && !/Move (?:up|down)|Move to/.test(allSource)) report("UI_DRAG_ONLY", "A drag interaction has no detectable non-drag alternative.", "Provide visible click/tap controls that perform the same move; keyboard support alone is not sufficient.", "WCAG 2.2 SC 2.5.7 Dragging Movements");
  if (/onMouseEnter\s*=/.test(allSource) && !/onFocus\s*=/.test(allSource)) report("UI_HOVER_WITHOUT_FOCUS", "Hover behavior has no detectable keyboard-focus equivalent.", "Make the same information available on focus and dismissible with Escape when it behaves as a tooltip.", "WCAG 2.2 SC 1.4.13 and WAI-ARIA Tooltip Pattern");

  return { ok: issues.length === 0, issues };
}
