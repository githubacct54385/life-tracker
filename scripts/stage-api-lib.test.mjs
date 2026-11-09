import { describe, expect, it } from "vitest";
import { applyPublishConfig, withoutDependency } from "./stage-api-lib.mjs";

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

describe("withoutDependency", () => {
  it("[AC-FND-06.4] drops a dependency but keeps the others and does not change the input", () => {
    const pkg = { name: "api", dependencies: { "@life-tracker/shared": "file:///x", mssql: "1.0.0" } };
    expect(withoutDependency(pkg, "@life-tracker/shared").dependencies).toEqual({ mssql: "1.0.0" });
    expect(pkg.dependencies["@life-tracker/shared"]).toBe("file:///x");
  });
});
