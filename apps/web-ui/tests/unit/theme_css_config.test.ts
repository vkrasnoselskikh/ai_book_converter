import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("Theme CSS configuration", () => {
  it("should include the supported daisyUI day and night themes", () => {
    const cssPath = path.resolve(__dirname, "../../src/index.css");
    const css = fs.readFileSync(cssPath, "utf-8");

    expect(css).toContain('@plugin "daisyui"');
    expect(css).toContain("themes: emerald --default, forest --prefersdark;");
  });
});
