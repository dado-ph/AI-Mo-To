# Snapshots and recovery

A snapshot captures the workspace manifest, revision history, installed-module metadata, local records, context, and event-log position. It is content-addressed and verified before a restore is proposed.

AI-Mo-To creates a pre-apply snapshot before a workspace change. Restoring a snapshot is itself a proposal and results in a new revision, so recovery preserves the earlier audit trail. Snapshots do not include secrets or replace normal file backups.
