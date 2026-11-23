import { defineConfig } from "vitest/config";
import { coverageFor } from "../coverage.config.mjs";

export default defineConfig({ test: { coverage: coverageFor("shared") } });
