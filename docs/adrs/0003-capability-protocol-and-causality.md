# Capabilities and approval

The engine, not a module or agent, decides the workspace authority level and effective capabilities. Modules receive a limited context reference and make requests through engine-managed calls.

Each proposal is tied to a canonical ChangeSet digest and a base revision. If its effects expand, its checks fail, or the workspace revision changes, the proposal must be reviewed again.
