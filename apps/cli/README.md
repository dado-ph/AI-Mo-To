# AI-Mo-To CLI

The CLI accepts an outcome in ordinary language. A user or AI assistant does not
need to know module, foundry, or ChangeSet terminology:

```powershell
aimoto init "My Life" --root my-life
aimoto request "Help me track meditation every day" --workspace my-life
```

`request` prepares and validates a proposal but never approves or installs it.
Its response explains what AI-Mo-To understood, what would be added, the exact
proposal digest, and the separate `apply` command required after human review.
Use `--json` for the versioned machine-readable envelope.

The current release honestly supports only habit and recurring-practice tracking.
Unsupported needs fail without creating a proposal or changing the workspace and
report the supported outcome in the JSON error details.

The lower-level `agent habit plan` command remains available for compatibility.

After installation, `module views` and `records list` let an assistant verify
the result without executing generated code. `habit create` and `habit log`
are deliberately explicit interactions with the installed tool. They should
only be run in response to a user's instruction to create that habit or log
that completion; approval to install the tool does not authorize personal-data
mutation. Run `aimoto --help --json` for the current argument contract.
