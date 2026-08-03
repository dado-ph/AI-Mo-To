import { describe, expect, it } from "vitest";
import { authorityBadge, nativeViewModel } from "../src/index.js";

describe("nativeViewModel", () => {
  it("keeps the native view contract declarative", () => {
    expect(nativeViewModel({ id: "files", title: "Files", emptyState: "No files." }, "Browse local files.")).toEqual({
      id: "files", title: "Files", emptyState: "No files.", description: "Browse local files."
    });
  });

  it("describes authority in user language", () => {
    expect(authorityBadge("suggest")).toEqual({ label: "Suggest changes", tone: "positive" });
    expect(authorityBadge("execute").tone).toBe("caution");
  });

  it("supports primitive UI component contract definitions", () => {
    const btn: import("../src/index.js").ButtonPrimitive = { variant: "default", label: "Submit" };
    const card: import("../src/index.js").CardPrimitive = { title: "Overview", content: "Details" };
    expect(btn.label).toBe("Submit");
    expect(card.title).toBe("Overview");
  });
});

