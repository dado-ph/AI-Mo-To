# Foundry guide

The Foundry is the guide AI-Mo-To gives to a coding agent when it is asked to build a workspace feature. It is not a list of templates: the agent should build the smallest useful application for the person's request.

## Where the agent works

1. **AI-Mo-To itself:** the product repository and installed platform. The agent must not edit this.
2. **Generated-app repository:** an isolated staging repository where the agent can write and test the feature.
3. **Person's workspace:** the trusted local workspace. A generated module enters it only through validation, a proposal, and a person's explicit `apply` command.

## What the agent should build

- Start by identifying the person's outcome, the main objects, and the smallest useful workflow.
- Create a self-contained, accessible interface with clear empty, loading, error, and cancellation states where they matter.
- Use the project's required Shadcn/UI setup and include `components.json` and generated `components/ui` source.
- Include a valid `module.json`, view declaration, and local persistence for the application state.
- Keep all source, assets, and generated files inside the allocated repository.
- Declare capabilities before using them. Never access other repositories, the network, secrets, a shell, or outside files without a declared and approved capability.

The platform validates the generated module, records its digest and requested capabilities, and presents it as a reviewable workspace proposal. The agent does not approve or apply its own work.

For the exact guide sent at runtime, see [`FOUNDRY_GUIDE`](../packages/foundry/src/guide.ts).
