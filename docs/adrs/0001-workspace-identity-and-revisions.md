# Workspace identity and revisions

Every AI-Mo-To workspace has a stable ID and a local revision history. A proposed change names the revision it was created from, so AI-Mo-To can reject it if the workspace has moved on.

This keeps parallel or delayed proposals from silently overwriting newer work. Restoring a snapshot also creates a new revision; it does not erase earlier history.
