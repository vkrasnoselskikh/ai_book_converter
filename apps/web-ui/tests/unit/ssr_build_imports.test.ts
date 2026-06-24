import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const sourceRoot = path.resolve(__dirname, "../../src");

const collectTsxFiles = (directory: string): string[] => {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectTsxFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".tsx") ? [entryPath] : [];
  });
};

describe("SSR build imports", () => {
  it("should use compiled JavaScript extensions for local TSX imports", () => {
    const importsWithJsxExtension = collectTsxFiles(sourceRoot).flatMap(
      (filePath) => {
        const source = fs.readFileSync(filePath, "utf-8");
        const matches = source.matchAll(
          /import\s+(?:[^"']+\s+from\s+)?["']\.{1,2}\/[^"']+\.jsx["']/g,
        );

        return Array.from(matches, (match) => ({
          filePath: path.relative(sourceRoot, filePath),
          importStatement: match[0],
        }));
      },
    );

    expect(importsWithJsxExtension).toEqual([]);
  });
});
