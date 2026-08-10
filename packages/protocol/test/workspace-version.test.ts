import { describe, expect, it } from "vitest";

import { validateProtocol } from "../src/index.js";

describe("workspace version protocol", () => {
  it("accepts a module-free workspace and rejects a legacy modules field", () => {
    expect(validateProtocol("workspace-manifest", {
      schemaVersion: 2,
      workspaceId: "garden",
      name: "Garden",
      createdAt: "2026-08-10T00:00:00.000Z",
      revision: 0,
      currentVersionId: null
    }).valid).toBe(true);

    expect(validateProtocol("workspace-manifest", {
      schemaVersion: 2,
      workspaceId: "garden",
      name: "Garden",
      createdAt: "2026-08-10T00:00:00.000Z",
      revision: 0,
      currentVersionId: null,
      modules: []
    }).valid).toBe(false);
  });
});
