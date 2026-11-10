// Cloudflare Worker entry point (ADR-0021). One Worker serves the built web app and the API.
// `/api/*` goes to the Hono app. Everything else is a static file from the ASSETS binding (single-page-app fallback).
import { createApp, type AppDeps } from "./app.js";
import type { AccessSettings } from "./auth/accessConfig.js";
import { withSecurityHeaders } from "./http/securityHeaders.js";
import { databaseReachable } from "./services/healthService.js";
import { logger } from "./telemetry/logger.js";

export interface Env extends AccessSettings {
  /** Static files from web/dist, bound by wrangler.jsonc. */
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function createWorker(deps: AppDeps) {
  const app = createApp(deps);
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const api = isApiPath(new URL(request.url).pathname);
      const response = api ? await app.fetch(request, env) : await env.ASSETS.fetch(request);
      return withSecurityHeaders(response, { api });
    },
  };
}

export default createWorker({ logger, checkDatabase: databaseReachable });
