import { describe, expect, it } from "vitest";
import { certsUrl, issuerFor, readAccessConfig } from "./accessConfig";

describe("access settings", () => {
  it("[AC-MIG-04.2] needs all three settings, and a blank one counts as missing", () => {
    const full = { ACCESS_TEAM_DOMAIN: "team.example.test", ACCESS_AUD: "aud-1", OWNER_EMAIL: "owner@example.test" };
    expect(readAccessConfig(full)).toEqual({ teamDomain: "team.example.test", audience: "aud-1", ownerEmail: "owner@example.test" });
    for (const key of Object.keys(full) as (keyof typeof full)[]) {
      expect(readAccessConfig({ ...full, [key]: undefined })).toBeUndefined();
      expect(readAccessConfig({ ...full, [key]: "   " })).toBeUndefined();
    }
    expect(readAccessConfig({})).toBeUndefined();
  });

  it("[AC-MIG-04.2] uses https for every team domain except a localhost one", () => {
    expect(certsUrl("team.example.test").href).toBe("https://team.example.test/cdn-cgi/access/certs");
    expect(issuerFor("team.example.test")).toBe("https://team.example.test");
    expect(certsUrl("localhost:9099").href).toBe("http://localhost:9099/cdn-cgi/access/certs");
    expect(issuerFor("127.0.0.1:9099")).toBe("http://127.0.0.1:9099");
    // a look-alike host is not treated as local
    expect(certsUrl("localhost.evil.example").protocol).toBe("https:");
  });
});
