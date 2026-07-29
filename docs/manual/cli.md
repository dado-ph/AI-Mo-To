# CLI guide

## Prerequisites and execution

Use Node.js 22 or newer and pnpm. Build before running the workspace-local CLI:

```sh
pnpm install
pnpm build
```

In this checkout, invoke it as `pnpm --filter @ai-mo-to/cli aimoto ...`.
`--json` writes one JSON envelope to standard output. Without it, successful
inspection is human-readable and other successful commands are pretty JSON.

## Complete approval quickstart

The current `plan` command only creates a `workspace.set-authority-mode`
proposal. It does not generate or install a module.

```sh
pnpm --filter @ai-mo-to/cli aimoto workspace create "My Workspace" --root ./my-workspace --json
pnpm --filter @ai-mo-to/cli aimoto plan --workspace ./my-workspace --set-authority build --json
```

Copy `data.proposalId` and `data.changeSetDigest` from the second command's JSON
output. In PowerShell, the following parses them without guessing their values:

```powershell
$plan = pnpm --filter @ai-mo-to/cli aimoto plan --workspace ./my-workspace --set-authority build --json | ConvertFrom-Json
$proposalId = $plan.data.proposalId
$digest = $plan.data.changeSetDigest
pnpm --filter @ai-mo-to/cli aimoto apply --workspace ./my-workspace --proposal $proposalId --hash $digest --json
pnpm --filter @ai-mo-to/cli aimoto inspect --workspace ./my-workspace --json
```

The POSIX-shell equivalent is:

```sh
PLAN="$(pnpm --filter @ai-mo-to/cli aimoto plan --workspace ./my-workspace --set-authority build --json)"
PROPOSAL_ID="$(printf '%s' "$PLAN" | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).data.proposalId')"
DIGEST="$(printf '%s' "$PLAN" | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).data.changeSetDigest')"
pnpm --filter @ai-mo-to/cli aimoto apply --workspace ./my-workspace --proposal "$PROPOSAL_ID" --hash "$DIGEST" --json
pnpm --filter @ai-mo-to/cli aimoto inspect --workspace ./my-workspace --json
```

The final inspection should report `revision: 1` and `authorityMode: "build"`.
Use `--principal <id>` on `apply` to record a supplied approver identifier;
without it the engine records `local-user`.

## Commands

```
aimoto workspace create "<name>" [--root <path>] [--json]
aimoto inspect [--workspace <path>] [--json]
aimoto plan --workspace <path> --set-authority <mode> [--json]
aimoto apply --workspace <path> --proposal <id> --hash <sha256:digest> [--principal <id>] [--json]
```

Paths are resolved relative to the current working directory. `workspace create`
defaults its root to a lowercase, hyphenated name. `inspect`, `plan`, and
`apply` default their workspace to `.`. The supported authority modes are
`observe`, `suggest`, `assist`, `execute`, and `build`.

`workspace create` rejects an empty name or a directory that already contains
an AI-Mo-To manifest. `plan` requires `--set-authority`. `apply` requires both
the proposal ID and its exact `sha256:` digest; it cannot approve a changed,
missing, already committed, or stale proposal.

Run `aimoto`, `aimoto help`, or `aimoto --help` for the short usage display.

## Output and exit status

JSON success has `ok: true` and `data`; JSON failure has `ok: false` and
`error`. `traceId` is a UUID generated for each CLI invocation; do not use it as
a stable identifier or a versioning guarantee. See [Protocol](protocol.md) for
the envelope shape. Human-mode errors go to standard error as `Code: message`.

| Command | `data` on JSON success |
| --- | --- |
| `workspace create` | Workspace inspection: `root`, `workspaceId`, `name`, `revision`, `createdAt`, `modules`, `authorityMode`, `health` |
| `inspect` | The same workspace inspection shape |
| `plan` | Proposal: `proposalId`, `workspaceId`, `baseRevision`, `changeSet`, `changeSetDigest`, `status`, `createdAt` |
| `apply` | The resulting workspace inspection shape |

For example, the minimum fields needed from a plan are
`{"ok":true,"data":{"proposalId":"...","changeSetDigest":"sha256:..."}}`.

| Error code | Typical cause | Recovery |
| --- | --- | --- |
| `InvalidInput` | Missing name, required flag, invalid mode, or existing workspace root | Correct the input or choose a new root. |
| `WorkspaceNotFound` | `--workspace` is not an initialized workspace | Create it first or supply the right path. |
| `ProposalNotFound` | Proposal ID is absent from workspace state | Re-plan or use the returned proposal ID. |
| `ProposalStale` | Workspace revision advanced after the proposal was based on it | Inspect and create a new plan from the current revision. |
| `ApprovalRequired` | Proposal is no longer pending, for example already applied | Do not reuse it; create a new proposal if needed. |
| `ValidationFailed` | Wrong digest, invalid contract, unsupported operation, or invalid module bundle | Use the exact `changeSetDigest` returned by `plan`; correct the invalid payload and re-plan. |
| `InternalError` | Unexpected runtime or filesystem failure | Inspect local state and retry; report the trace ID with logs. |

Exit status is `0` for success and help, `2` for bad usage or handled engine
errors, and `1` for an unexpected internal failure. Unknown commands print
usage and return `2`.
