# Modules and trust tiers

Modules declare a trust tier: `core`, `local-generated`, `verified-community`, or `community`. A module handler runs in a local Node child process and asks the engine for the capabilities it needs.

The child process contains crashes and timeouts, but it is not an operating-system security sandbox. Capability checks apply when a module uses the engine's managed interfaces.
