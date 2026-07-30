# Outcome-First Agent Acceptance Plan

1. Make installation a one-command, verifiable operation for a clean Windows
   user and place both the desktop application and `aimoto` on discoverable
   installed paths. Verify the stable installed-launcher fallback from an agent
   process whose inherited PATH does not contain WindowsApps.
2. Complete the agent-facing lifecycle commands and make `--help`, readable
   output, versioned JSON, and stable errors sufficient for discovery.
3. Deliver one useful installed-product vertical slice: default Files and Tasks,
   an approved Habit Tracker addition, record interaction, provenance, and
   recovery visibility.
4. Use `scripts/acceptance/New-InstalledRoleplay.ps1` to create an isolated
   role-play root outside the repository. Launch the external agent there with
   only the ordinary-language user request, pause at proposal review, and resume
   only with the person's digest-bound approval.
5. Capture negative approval, stale-state, host-failure, and recovery evidence.
6. Run full validation after every implementation wave. Failed validation is
   repaired by another targeted wave before acceptance is attempted again.
7. Verify the evidence boundary with
   `scripts/acceptance/Test-InstalledRoleplay.ps1`: the installed CLI must be
   used, the repository and unrelated builders must not be used, and inspection,
   provenance, packaged desktop use, negative approval, and recovery evidence
   must all be present.
