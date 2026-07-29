# Plan

1. Add capability evaluation at the engine invocation boundary.
2. Materialize verified snapshot state only through an approved restore
   ChangeSet and revision transaction.
3. Cover stale, tampered, missing-capability, and successful recovery paths.
4. Expose the approved recovery loop in the CLI and manual.
