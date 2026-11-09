/** Layer rules from ARCHITECTURE.md. More layers are added as folders appear. */
export default {
  forbidden: [
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
    {
      name: "shared-is-leaf",
      comment: "shared/ must not import from web or api",
      severity: "error",
      from: { path: "^shared/src" },
      to: { path: "^(web|api)/src" },
    },
    {
      name: "web-not-api",
      comment: "web talks to the API over HTTP only",
      severity: "error",
      from: { path: "^web/src" },
      to: { path: "^api/src" },
    },
    {
      name: "api-not-web",
      severity: "error",
      from: { path: "^api/src" },
      to: { path: "^web/src" },
    },
    {
      name: "sql-only-in-repositories",
      comment: "Only repositories/ and db/ may import the mssql package",
      severity: "error",
      from: { pathNot: "^api/src/(repositories|db)/" },
      to: { path: "node_modules/mssql" },
    },
    {
      name: "layers-point-down",
      comment: "handlers -> services -> repositories -> db, never upward",
      severity: "error",
      from: { path: "^api/src/services/" },
      to: { path: "^api/src/handlers/" },
    },
    {
      name: "repositories-not-up",
      severity: "error",
      from: { path: "^api/src/repositories/" },
      to: { path: "^api/src/(services|handlers)/" },
    },
  ],
  options: { tsConfig: { fileName: "tsconfig.base.json" }, doNotFollow: { path: "node_modules" } },
};
