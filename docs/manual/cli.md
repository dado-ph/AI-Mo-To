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
proposal. For the product’s first agent-driven proof, use `agent habit plan`.

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

## Try the agent-driven Habit Tracker proof

This is the complete local product path. It needs no account, API key, or
network request. Your words are shown back to you as the request; the
deterministic reference generator creates a small, inspectable Habit Tracker
with habits, daily check-ins, and completion history.

```powershell
pnpm --filter @ai-mo-to/cli aimoto workspace create "My Habits" --root ./my-habits --json
$review = pnpm --filter @ai-mo-to/cli aimoto agent habit plan --workspace ./my-habits --request "I want to track meditation every day" --json | ConvertFrom-Json

# Read $review.data.plan and $review.data.proposal before continuing.
$proposalId = $review.data.proposal.proposalId
$digest = $review.data.proposal.changeSetDigest
pnpm --filter @ai-mo-to/cli aimoto apply --workspace ./my-habits --proposal $proposalId --hash $digest --json
pnpm --filter @ai-mo-to/cli aimoto inspect --workspace ./my-habits --json
```

Before approval, the review describes the records and views the module adds,
the capabilities it requests, its staged location, and the exact SHA-256
bundle digest. `apply` checks that digest and the workspace revision before it
copies the verified module into the workspace. If you change the digest or the
workspace advances, it is not installed; run the plan again and review the new
proposal.

For a readable review instead of JSON, omit `--json`:

```sh
pnpm --filter @ai-mo-to/cli aimoto agent habit plan --workspace ./my-habits --request "Track my daily habits"
```

## Commands

```
aimoto workspace create "<name>" [--root <path>] [--json]
aimoto inspect [--workspace <path>] [--json]
aimoto snapshot create [--workspace <path>] [--json]
aimoto snapshot list [--workspace <path>] [--json]
aimoto snapshot inspect <snapshot-id> [--workspace <path>] [--json]
aimoto snapshot restore-plan <snapshot-id> [--workspace <path>] [--json]
aimoto snapshot restore-propose <snapshot-id> [--workspace <path>] [--json]
aimoto agent habit plan --workspace <path> [--request "what you need"] [--json]
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

## Snapshots and recovery

Snapshots are local, verified recovery records. Creating one captures the
workspace manifest, revision history, installed-module metadata, local context,
and event-log position; it does not send workspace contents anywhere.

```powershell
$snapshot = pnpm --filter @ai-mo-to/cli aimoto snapshot create --workspace ./my-workspace --json | ConvertFrom-Json
$snapshotId = $snapshot.data.snapshotId
pnpm --filter @ai-mo-to/cli aimoto snapshot list --workspace ./my-workspace --json
pnpm --filter @ai-mo-to/cli aimoto snapshot inspect $snapshotId --workspace ./my-workspace --json
pnpm --filter @ai-mo-to/cli aimoto snapshot restore-plan $snapshotId --workspace ./my-workspace --json
$restore = pnpm --filter @ai-mo-to/cli aimoto snapshot restore-propose $snapshotId --workspace ./my-workspace --json | ConvertFrom-Json

# Review the restore proposal before approving it. The workspace has not changed yet.
$proposalId = $restore.data.proposalId
$digest = $restore.data.changeSetDigest
pnpm --filter @ai-mo-to/cli aimoto apply --workspace ./my-workspace --proposal $proposalId --hash $digest --json
```

`snapshot inspect` verifies its stored digest. `snapshot restore-plan` is
deliberately non-destructive: it shows what a restore would change and leaves
the workspace untouched. `snapshot restore-propose` creates a normal pending
proposal bound to the exact snapshot ID, captured manifest digest, and current
workspace revision. Only `apply` with that proposal's exact digest performs
the restore. It creates a new revision; it never replaces the old revision
history. If the workspace changes after the proposal is created, approval is
rejected as stale and you must propose the restore again.

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
| `snapshot create` | Snapshot ID, creation time, and verified digest |
| `snapshot list` | Available snapshot summaries |
| `snapshot inspect` | Verification result and captured recovery metadata |
| `snapshot restore-plan` | Non-destructive recovery plan |
| `snapshot restore-propose` | Pending digest-bound proposal that restores the captured workspace configuration as a new revision |
| `agent habit plan` | Request, plain-language Habit Tracker plan, staged module details, and a pending digest-bound proposal |
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
