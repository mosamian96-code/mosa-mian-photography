import { describe, expect, it } from "vitest";
import { buildFolderPaths } from "./folder-paths";

describe("buildFolderPaths", () => {
  it("builds the full path for nested folders", () => {
    const paths = buildFolderPaths([
      { id: "root", parentId: null, slug: "public-gallery" },
      { id: "travel", parentId: "root", slug: "travel" },
      { id: "prague", parentId: "travel", slug: "prague" },
    ]);
    expect(paths.get("root")).toBe("/public-gallery");
    expect(paths.get("travel")).toBe("/public-gallery/travel");
    expect(paths.get("prague")).toBe("/public-gallery/travel/prague");
  });

  it("leaves out folders whose ancestor is missing", () => {
    const paths = buildFolderPaths([{ id: "child", parentId: "hidden-parent", slug: "child" }]);
    expect(paths.has("child")).toBe(false);
  });

  it("does not hang on a parent loop", () => {
    const paths = buildFolderPaths([
      { id: "a", parentId: "b", slug: "a" },
      { id: "b", parentId: "a", slug: "b" },
    ]);
    expect(paths.size).toBe(0);
  });
});
