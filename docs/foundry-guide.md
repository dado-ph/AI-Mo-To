# AI-Mo-To Foundry Guide

The Foundry is the reasoning and engineering harness supplied to coding agents when AI-Mo-To asks them to create an application. It is not a catalogue of fixed templates: requests may require novel source code, algorithms, data models, and custom interactions.

---

## 🏛️ The 3-Tier Boundary Contract

1. **Tier 1 (Core Host Platform)**: The AI agent is **strictly forbidden** from editing the core AI-Mo-To product repository (`packages/`, `apps/`). The platform harness owns security, permission checks, static validation, proposal digests, and execution.
2. **Tier 2 (Generative App Lab / Staging)**: The agent receives an allocated, isolated app directory. The agent authors React UI components, shadcn-inspired UI primitives, CSS design token values (`--background`, `--foreground`, `--primary`, `--card`, `--radius`), Python/Node scripts, and a valid `module.json` manifest.
3. **Tier 3 (User Workspace)**: The human-governed file environment (`Documents/AI-Mo-To/Workspaces/`). User files (`.md`, `.pdf`, `.csv`, code) are primary. Approved app bundles are installed into `.aimoto/modules/` inside the workspace and run under explicit capability governance.

---

## 🎨 UI/UX & Design Philosophy

* **No Hardcoded Themes**: AI-Mo-To provides standard CSS token variable slots (`--background`, `--foreground`, `--primary`, `--card`, `--border`, `--radius`). As the AI designer, infer the user's intent and author custom color palettes, typography, and visual aesthetics directly.
* **Shadcn UI Primitives**: Compose views using semantic, keyboard-accessible component primitives (`Button`, `Card`, `Dialog`, `Input`, `Badge`, `Table`, `Tabs`).

---

## 🛠️ Programmatic API Context

The canonical programmatic context is exported by `@ai-mo-to/foundry` as `FOUNDRY_GUIDE` and `createFoundryContext`.
