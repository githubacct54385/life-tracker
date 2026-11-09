import { describe, expect, it } from "vitest";
import { applyPublishConfig } from "./stage-api-lib.mjs";

describe("applyPublishConfig", () => {
  it("[AC-FND-06.4] replaces source entry points with compiled ones for the deployed package", () => {
    const staged = applyPublishConfig({
      name: "@life-tracker/shared",
      main: "src/index.ts",
      types: "src/index.ts",
      publishConfig: { main: "dist/index.js", types: "dist/index.d.ts", exports: { ".": "./dist/index.js" } },
    });
    expect(staged.main).toBe("dist/index.js");
    expect(staged.types).toBe("dist/index.d.ts");
    expect(staged.exports).toEqual({ ".": "./dist/index.js" });
    expect(staged.publishConfig).toBeUndefined();
  });

  it("[AC-FND-06.4] leaves a package without publishConfig unchanged", () => {
    expect(applyPublishConfig({ name: "x", main: "a.js" })).toEqual({ name: "x", main: "a.js" });
  });
});
