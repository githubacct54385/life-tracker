// The one check every handler calls first. Identity first, then the custom header.
import { ownerGuard, type GuardResult } from "./ownerGuard";
import { requestGuard } from "./requestGuard";

export interface GuardedRequest {
  method: string;
  headers: Record<string, string | undefined>;
}

export function authorize(request: GuardedRequest, ownerId: string | undefined): GuardResult {
  const identity = ownerGuard(request.headers["x-ms-client-principal"], ownerId);
  if (!identity.ok) return identity;
  return requestGuard(request.method, request.headers);
}
