// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Tiny static host for the R1 spike. It serves:
//   /embed.html                 the host page that embeds Pol.is via legacy embed.js
//   /r1-embed.js                the host page's script (builds the .polis div)
//   /.well-known/jwks.json      the local test issuer's public key (Pol.is JWKS_URI)
//
// It listens on 127.0.0.1 and ::1 only, so it is reachable as
// http://localhost:8190 (the "same-site" host) and http://127.0.0.1:8190 (an
// "off-domain" host for the domain-whitelist check). Docker Desktop forwards
// host.docker.internal to the host loopback, which is how Pol.is reaches the JWKS.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HOST_PORT, R1_DIR, jwks } from "../lib/polis.mjs";

const files = {
  "/embed.html": ["text/html; charset=utf-8", join(R1_DIR, "host", "embed.html")],
  "/r1-embed.js": ["text/javascript; charset=utf-8", join(R1_DIR, "host", "r1-embed.js")],
};

function handler(req, res) {
  const path = new URL(req.url, "http://x").pathname;
  if (path === "/.well-known/jwks.json") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(jwks()));
    return;
  }
  if (path === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  const f = files[path];
  if (!f) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": f[0], "Cache-Control": "no-store" });
  res.end(readFileSync(f[1]));
}

for (const host of ["127.0.0.1", "::1"]) {
  createServer(handler)
    .listen(HOST_PORT, host, () => console.log(`R1 host listening on http://${host.includes(":") ? `[${host}]` : host}:${HOST_PORT}`))
    .on("error", (e) => console.error(`R1 host could not bind ${host}:${HOST_PORT}: ${e.message}`));
}
