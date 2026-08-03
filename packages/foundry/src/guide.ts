/** Guidance supplied to an external coding agent; not a catalogue of apps. */
export const FOUNDRY_GUIDE_VERSION = "2026-08-03";
export const FOUNDRY_GUIDE = `# AI-Mo-To Foundry Guide (v${FOUNDRY_GUIDE_VERSION})

Build inside the allocated generated application staging directory (Tier 2). The Foundry is guidance,
not a finite list of app types: invent domain logic and source code as needed for the user's outcome.

## 🏛️ 3-Tier Boundary Contract
- **Tier 1 (Core Host Platform)**: The AI agent is STRICTLY FORBIDDEN from editing the core AI-Mo-To product repository (\`packages/\`, \`apps/\`). The platform harness owns security, permission checks, static validation, proposal digests, and execution.
- **Tier 2 (Generative App Lab / Staging)**: Build inside the allocated app staging repository. Author source code (React UI, CSS tokens, Python/Node scripts, \`module.json\` manifest) and compile self-contained static app bundles here.
- **Tier 3 (User Workspace)**: The human-governed workspace (\`Documents/AI-Mo-To/Workspaces/\`). User files (\`.md\`, \`.pdf\`, \`.csv\`, code) are primary. Approved app bundles are installed into \`.aimoto/modules/\` and execute under explicit capability governance.

## Reasoning
- Restate the desired outcome and identify the smallest useful workflow.
- Model entities, actions, derived values, and state transitions before coding.
- Support one-at-a-time interaction when useful; provide explicit stop/cancel
  behavior and preserve completed work.
- Ask focused questions only when a safe implementation cannot be inferred.

## Default stack
- TypeScript with React and Vite.
- Local CSS design tokens and shadcn-inspired UI component primitives (Button, Card, Dialog, Input, Badge, Table, Tabs); no remote runtime assets.
- AI-authored visual design: AI-Mo-To provides standard CSS token variable slots (\`--background\`, \`--foreground\`, \`--card\`, \`--primary\`, \`--radius\`). As the AI designer, infer the user's intent and author the exact color palette, typography, and visual feel that best suits the application; do not rely on hardcoded theme enums.
- Approved AI-Mo-To storage adapter for persistence.
- Vitest for logic and Playwright for critical UI flows.
- Self-contained static bundle plus an AI-Mo-To application manifest.
- Network, shell, outside-repository filesystem, and secrets require declared and approved capabilities.

## Product quality
Leverage perfected UI/UX component patterns (shadcn primitives): use semantic, keyboard-accessible HTML, visible focus, responsive layouts,
clear loading/error/empty states, readable hierarchy, consistent spacing/type/colour, input validation, and explicit recoverable destructive actions.

## Workspace shape
The workspace is a human-governed, file-native environment generated for the person's needs. Compose its navigation, home view, data surfaces, actions, and supporting screens around the inferred workflow. Preserve the substrate every workspace needs: a clear way to understand what is installed, inspect authority and capabilities, see health and provenance, recover safely, and reach the generated application.

## AI-Mo-To integration
Keep source and assets inside the allocated app repository. Declare app name, version, entry point, capabilities, persistence, and build/test commands in the manifest. Never modify the AI-Mo-To product repository. Return implementation summary, evidence, capabilities, and limitations for proposal review. The harness owns approval, installation, and execution.
`;

export interface FoundryContextOptions { request: string; repositoryPath: string; manifestPath?: string; }
export function createFoundryContext(options: FoundryContextOptions): string {
  const manifest = options.manifestPath ?? `${options.repositoryPath}/aimoto.manifest.json`;
  return `${FOUNDRY_GUIDE}\n\n## Current task\nRepository: ${options.repositoryPath}\nManifest: ${manifest}\nUser request:\n${options.request}\n`;
}
