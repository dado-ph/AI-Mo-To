# AI-Mo-To CLI

`aimoto` is the command-line way to create, inspect, and evolve a local AI-Mo-To workspace.

It has one simple rule: a request can prepare a change, but only `apply` can commit it, and `apply` requires the exact proposal ID and digest that a person has reviewed.

## Start a workspace

```powershell
aimoto workspace create "My Workspace" --root ./my-workspace
aimoto inspect --workspace ./my-workspace
```

## Ask for a workspace feature

Use `request` for a direct local request:

```powershell
aimoto request "Help me track meditation every day" --workspace ./my-workspace
```

Or let a configured Codex CLI agent build a feature in an isolated generated-app repository:

```powershell
aimoto request "Create a project tracker with a weekly view" --workspace ./my-workspace --agent
```

Both commands return a proposal. Read the proposed changes, requested capabilities, proposal ID, and SHA-256 digest. Do not treat a request as approval.

## Apply a reviewed proposal

```powershell
aimoto apply --workspace ./my-workspace --proposal <proposal-id> --hash <sha256:digest>
```

AI-Mo-To rejects a changed, stale, missing, or already-applied proposal. It also creates a pre-apply recovery snapshot before committing a workspace change.

Use `aimoto --help --json` for the machine-readable command contract, or see the [full CLI guide](../../docs/manual/cli.md).
