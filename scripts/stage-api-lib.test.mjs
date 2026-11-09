import { describe, expect, it } from "vitest";
import { rewriteSharedImports, toDeployPackage } from "./stage-api-lib.mjs";

const entry = "/stage/dist/_shared/index.js";

describe("rewriteSharedImports", () => {
  it("[AC-FND-06.4] points static imports at a relative path from the importing file", () => {
    const src = 'import { A } from "@life-tracker/shared";\nexport * from "@life-tracker/shared";\n';
    expect(rewriteSharedImports(src, "/stage/dist/auth/ownerGuard.js", entry)).toBe(
      'import { A } from "../_shared/index.js";\nexport * from "../_shared/index.js";\n',
    );
    expect(rewriteSharedImports('import { A } from "@life-tracker/shared";', "/stage/dist/index.js", entry)).toBe(
      'import { A } from "./_shared/index.js";',
    );
  });

  it("[AC-FND-06.4] also rewrites dynamic and side-effect imports, and leaves other packages alone", () => {
    const src = 'const m = await import("@life-tracker/shared");\nimport "@life-tracker/shared";\nimport sql from "mssql";\n';
    expect(rewriteSharedImports(src, "/stage/dist/a.js", entry)).toBe(
      'const m = await import("./_shared/index.js");\nimport "./_shared/index.js";\nimport sql from "mssql";\n',
    );
  });
});

describe("toDeployPackage", () => {
  it("[AC-FND-06.4] has no scripts and no dependency on shared, and does not change its input", () => {
    const pkg = {
      name: "api",
      scripts: { build: "tsc -p tsconfig.build.json" },
      devDependencies: {},
      dependencies: { "@life-tracker/shared": "file:///build/machine/shared", mssql: "1.0.0" },
    };
    const staged = toDeployPackage(pkg);
    expect(staged.scripts).toBeUndefined();
    expect(staged.dependencies).toEqual({ mssql: "1.0.0" });
    expect(pkg.dependencies["@life-tracker/shared"]).toBeDefined();
  });
});
