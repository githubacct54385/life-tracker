// Starts a tiny key server that stands in for Cloudflare Access's published keys during end-to-end tests.
// It makes a throwaway key pair at start-up, serves the public half at the same path Access uses, and writes the
// private half to a file the tests read to sign synthetic tokens. Nothing here is a real credential, and the Worker
// is unaware of any of it: it just fetches keys from its configured team domain, as it does in production.
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { exportJWK, generateKeyPair } from "jose";

const port = Number(process.argv[2] ?? 9099);
const keyFile = process.argv[3] ?? "test-results/e2e-access-key.json";

const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
const kid = "e2e-key";
const publicJwk = { ...(await exportJWK(publicKey)), kid, alg: "RS256", use: "sig" };
const privateJwk = { ...(await exportJWK(privateKey)), kid, alg: "RS256" };

mkdirSync(new URL(`file://${process.cwd()}/${keyFile}/..`), { recursive: true });
writeFileSync(keyFile, JSON.stringify(privateJwk));

createServer((req, res) => {
  if (req.url === "/cdn-cgi/access/certs") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ keys: [publicJwk] }));
  } else {
    res.writeHead(404).end();
  }
}).listen(port, "127.0.0.1", () => console.log(`access key server on ${port}`));
