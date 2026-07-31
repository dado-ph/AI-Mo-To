/** Guidance supplied to an external coding agent; not a catalogue of apps. */
export const FOUNDRY_GUIDE_VERSION = "2026-07-30";
export const FOUNDRY_GUIDE = `# AI-Mo-To Foundry guide (v${FOUNDRY_GUIDE_VERSION})

Build in the isolated generated application repository. The Foundry is guidance,
not a finite list of app types: invent domain logic and source code as needed.

## Reasoning
- Restate the desired outcome and identify the smallest useful workflow.
- Model entities, actions, derived values, and state transitions before coding.
- Support one-at-a-time interaction when useful; provide explicit stop/cancel
  behavior and preserve completed work.
- Ask focused questions only when a safe implementation cannot be inferred.

## Default stack
- TypeScript with React and Vite.
- Local CSS/design tokens; no remote runtime assets.
- Approved AI-Mo-To storage adapter for persistence.
- Vitest for logic and Playwright for critical UI flows.
- Self-contained static bundle plus an AI-Mo-To application manifest.
- Network, shell, outside-repository filesystem, and secrets require declared
  and approved capabilities.

## Product quality
Use semantic, keyboard-accessible HTML, visible focus, responsive layouts,
clear loading/error/empty states, readable hierarchy, consistent spacing/type/
colour, input validation, and explicit recoverable destructive actions.

## Workspace shape
The workspace is usually a product-shaped environment generated for the
person's needs, not a fixed Files-and-Tasks dashboard. Compose its navigation,
home view, data surfaces, actions, and supporting screens around the inferred
workflow. Preserve only the absolute substrate every workspace needs: a clear
way to understand what is installed, inspect authority and capabilities, see
health and provenance, recover safely, and reach the generated application.
Workspaces may resemble one another because this substrate and the Foundry's
quality principles are shared; do not add generic modules merely to make every
workspace look the same.

## AI-Mo-To integration
Keep source and assets inside the allocated app repository. Declare app name,
version, entry point, capabilities, persistence, and build/test commands in the
manifest. Never modify the AI-Mo-To product repository. Return implementation
summary, evidence, capabilities, and limitations for proposal review. The
harness owns approval, installation, and execution.
`;
export interface FoundryContextOptions { request: string; repositoryPath: string; manifestPath?: string; }
export function createFoundryContext(options: FoundryContextOptions): string {
  const manifest = options.manifestPath ?? `${options.repositoryPath}/aimoto.manifest.json`;
  return `${FOUNDRY_GUIDE}\n\n## Current task\nRepository: ${options.repositoryPath}\nManifest: ${manifest}\nUser request:\n${options.request}\n`;
}
