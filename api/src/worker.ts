// Cloudflare Worker entry point (ADR-0021). One Worker serves the built web app and the API.
// `/api/*` goes to the Hono app. Everything else is a static file from the ASSETS binding (single-page-app fallback).
import { createApp, type AppDeps } from "./app.js";
import type { AccessSettings } from "./auth/accessConfig.js";
import { httpsRedirect } from "./http/httpsOnly.js";
import { withSecurityHeaders } from "./http/securityHeaders.js";
import { databaseReachable } from "./services/healthService.js";
import { giftService } from "./services/giftService.js";
import { odometerService } from "./services/odometerService.js";
import { runWithDatabase } from "./services/requestScope.js";
import { logger } from "./telemetry/logger.js";

export interface Env extends AccessSettings {
  /** Neon connection string for the app role. A Worker secret (never in the repo, never logged). */
  DATABASE_URL?: string;
  /** Static files from web/dist, bound by wrangler.jsonc. */
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function createWorker(deps: AppDeps) {
  const app = createApp(deps);
  return {
    async fetch(request: Request, env: Env, ctx?: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
      const redirect = httpsRedirect(request);
      if (redirect) return withSecurityHeaders(redirect, { api: false });
      const api = isApiPath(new URL(request.url).pathname);
      const response = api
        ? await runWithDatabase(env.DATABASE_URL, async () => app.fetch(request, env), (done) => ctx?.waitUntil(done))
        : await env.ASSETS.fetch(request);
      return withSecurityHeaders(response, { api });
    },
  };
}

export default createWorker({ logger, checkDatabase: databaseReachable, odometer: odometerService, gifts: giftService });
