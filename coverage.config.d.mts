/** The `test.coverage` block for a package: "shared", "api", "api-int" or "web". */
export function coverageFor(name: string): {
  provider: "v8";
  include: string[];
  exclude: string[];
  reporter: string[];
  reportsDirectory: string;
  thresholds: { lines: number; branches: number };
};
