# Implementation Plan

Keep ChangeSet construction at the Foundry boundary: it is a pure conversion
from a successful generated proposal plus caller-owned revision metadata. Keep
disk verification separate so the engine can use it immediately before commit.
