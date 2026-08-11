/** Curated implementation guidance; application kinds are never classified. */
export const FOUNDRY_GUIDE_VERSION = "2026-08-10";

export const FOUNDRY_GUIDE = `# AI-Mo-To workspace implementation guide (v${FOUNDRY_GUIDE_VERSION})

Use the implementation brief to implement directly beneath the canonical workspace root. AI-Mo-To has created or reused that root, but it has not built the requested application.

- Create only the source, UI, scripts, data, and assets required by this workspace.
- Build a real interactive UI with connected callbacks or scripts; do not return a mockup, documentation-only response, or unimplemented plan.
- Treat domain state as durable. Records, settings, files, queued work, and other user-visible results must use a real workspace-owned store or service, never a hard-coded array or page memory. Keep only transient view state, such as an open dialog or draft form, in the browser. Example: creating a project persists it and reload reads it back. If a required host integration is unavailable, state that limitation; do not simulate success.
- For requested OS, script, file, process, or external-service effects, declare an action in aimoto.actions.json, place its handler under scripts/, and call it through the aimoto.workspace-action parent-message bridge. The handler receives JSON on standard input, returns one JSON object on standard output, and persists the real result before returning. Do not substitute a browser dialog, alert, timer, localStorage, or an invented success state.
- For every interactive UI, use Shadcn with components.json, generated primitives, and cn() for conditional styling. Include clear first-use, empty, loading, validation, success, cancellation, and error states.
- Keep AI-Mo-To version history inside .aimoto/versions; do not edit captures in place.
- Meet WCAG 2.2 interaction basics: keyboard operation and visible focus, hover/focus parity, pointer cancellation, click/tap alternatives to dragging, and 24px targets unless an exception applies. Run aimoto verify, correct every reported issue, and rerun it until it passes before reporting completion.
- Explain the completed change and ask whether the user wants to save it as a new version.
- Run version create only after explicit approval in a later user message.
`;

export interface FoundryContextOptions {
  request: string;
  workspaceRoot: string;
}

export function createFoundryContext(options: FoundryContextOptions): string {
  return `${FOUNDRY_GUIDE}\n\n## Current task\nCanonical workspace root: ${options.workspaceRoot}\nUser request:\n${options.request.trim()}\n`;
}
