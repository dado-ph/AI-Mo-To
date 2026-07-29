import { describe, expect, it } from "vitest";
import { nativeViewModel } from "../src/index.js";

describe("nativeViewModel", () => {
  it("keeps the native view contract declarative", () => {
    expect(nativeViewModel({ id: "files", title: "Files", emptyState: "No files." }, "Browse local files.")).toEqual({
      id: "files", title: "Files", emptyState: "No files.", description: "Browse local files."
    });
  });
});
