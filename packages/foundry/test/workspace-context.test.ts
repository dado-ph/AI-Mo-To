import { describe, expect, it } from "vitest";

import { createFoundryContext } from "../src/index.js";

describe("workspace implementation context", () => {
  it("directs the agent to the canonical workspace without staging a module", () => {
    const context = createFoundryContext({
      request: "Build a garden planner",
      workspaceRoot: "C:/workspaces/garden",
    });

    expect(context).toContain("C:/workspaces/garden");
    expect(context).toContain("Build a garden planner");
    expect(context).toContain("implement directly beneath the canonical workspace root");
    expect(context).not.toMatch(/module\.json|module bundle|staging repository/i);
  });
});
