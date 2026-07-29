# Implementation plan

Keep the deterministic reference generator in Foundry, where staging and
validation belong. Let the CLI orchestrate the engine-owned proposal and
approval boundary, so no generated code can write the workspace directly.
