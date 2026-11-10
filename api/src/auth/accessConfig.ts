// The three settings ownerGuard needs. They come from Worker variables and secrets, never from a file in the repo (hard rule 2).
export interface AccessConfig {
  /** Your Cloudflare Zero Trust team domain, for example "myteam.cloudflareaccess.com". */
  teamDomain: string;
  /** The audience tag of the Access application. */
  audience: string;
  /** The owner's sign-in email, as GitHub reports it to Access. */
  ownerEmail: string;
}

export interface AccessSettings {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  OWNER_EMAIL?: string;
}

/** Returns undefined unless all three settings are present and not blank. The guard then denies everyone (fail closed). */
export function readAccessConfig(settings: AccessSettings): AccessConfig | undefined {
  const teamDomain = settings.ACCESS_TEAM_DOMAIN?.trim();
  const audience = settings.ACCESS_AUD?.trim();
  const ownerEmail = settings.OWNER_EMAIL?.trim();
  if (!teamDomain || !audience || !ownerEmail) return undefined;
  return { teamDomain, audience, ownerEmail };
}

/**
 * Where Access publishes its public signing keys. Local development and the test server use a plain-http
 * localhost address; every other team domain is https only. A Worker running on Cloudflare cannot reach localhost.
 */
export function certsUrl(teamDomain: string): URL {
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(teamDomain);
  return new URL(`${local ? "http" : "https"}://${teamDomain}/cdn-cgi/access/certs`);
}

export function issuerFor(teamDomain: string): string {
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(teamDomain);
  return `${local ? "http" : "https"}://${teamDomain}`;
}
