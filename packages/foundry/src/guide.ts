/** Curated implementation guidance; application kinds are never classified. */
export const FOUNDRY_GUIDE_VERSION = "2026-08-10";

export const FOUNDRY_GUIDE = `# AI-Mo-To workspace implementation guide (v${FOUNDRY_GUIDE_VERSION})

Use the implementation brief to implement directly beneath the canonical workspace root. AI-Mo-To has created or reused that root, but it has not built the requested application.

- Create only the source, UI, scripts, data, and assets required by this workspace.
- Build a real interactive UI with connected callbacks or scripts; do not return a mockup, documentation-only response, or unimplemented plan.
- Use Shadcn components where suitable and include clear first-use, empty, loading, validation, and error states.
- Keep AI-Mo-To version history inside .aimoto/versions; do not edit captures in place.
- Verify the requested behavior before reporting completion.
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
