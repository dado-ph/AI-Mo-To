# The agent-built workspace flow

AI-Mo-To is designed to let a person describe a workspace feature in ordinary language and let a coding agent build it without receiving access to the trusted workspace or the AI-Mo-To product repository.

The flow is:

1. AI-Mo-To creates an isolated generated-app repository for the agent.
2. The agent builds and validates a module there.
3. AI-Mo-To creates a digest-bound proposal for the workspace.
4. A person reviews the proposal and explicitly runs `apply`.
5. AI-Mo-To installs the verified bundle and records a new workspace revision.

The essential proof is not that an agent can write code. It is that a useful feature can enter a local workspace through this reviewable, recoverable path.
