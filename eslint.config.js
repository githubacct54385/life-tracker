import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/playwright-report/**", "**/test-results/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  {
    // AC-OPS-01.2: API code logs only through api/src/telemetry/logger.ts. CLI tools and tests may print.
    files: ["api/src/**/*.ts"],
    ignores: ["api/src/telemetry/**", "api/src/db/migrate-cli.ts", "api/src/db/globalSetup.int.ts", "**/*.test.ts"],
    rules: { "no-console": "error" },
  },
  {
    // AC-FND-03.3: SQL text may appear only in api/src/repositories, api/src/db and tests.
    // Convention: write SQL keywords in UPPER CASE. Importing pg elsewhere is also banned by depcruise.
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["api/src/repositories/**", "api/src/db/**", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...[
          ["Literal", "value"],
          ["TemplateElement", "value.raw"],
        ].map(([node, field]) => ({
          selector: `${node}[${field}=/(\\bSELECT\\s[\\s\\S]*\\sFROM\\s|\\bINSERT\\s+INTO\\s|\\bUPDATE\\s+\\S+\\s+SET\\s|\\bDELETE\\s+FROM\\s|\\bMERGE\\s+INTO\\s|\\b(CREATE|ALTER|DROP|TRUNCATE)\\s+(TABLE|INDEX|VIEW|PROCEDURE)\\b|\\bEXEC(UTE)?\\s+\\w)/]`,
          message: "SQL belongs in api/src/repositories only (AGENTS.md, AC-FND-03.3).",
        })),
      ],
    },
  },
);
