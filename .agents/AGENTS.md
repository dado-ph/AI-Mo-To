# Repository Rules & Constraints

## PowerShell Command Execution
- When invoking PowerShell commands with inline environment variable assignments via runner tools, escape `$` signs (e.g., `` `$env:AI_MO_TO_USE_LOCAL_BUILD='1'` ``) to avoid premature shell expansion.

## UI Component & TypeScript Conventions
- **Shadcn/CVA Variant Strictness**: Ensure component `variant` props strictly align with `cva` definitions (`Badge`: `"default" | "secondary"`, `Button`: `"default" | "outline" | "ghost"`).
- **Exact Optional Property Types**: When `exactOptionalPropertyTypes: true` is enabled, explicitly annotate optional component props as `prop?: T | undefined` if `undefined` values will be passed.

## IPC Test Invariants
- When adding new Electron IPC channel handlers to `registerDesktopIpc` in `apps/desktop/src/main.ts`, update the unit test channel assertions in `apps/desktop/test/desktop.test.ts`.
