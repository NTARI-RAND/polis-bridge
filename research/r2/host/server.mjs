// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Static host for the R2 spike. Replaces research/r1/host/server.mjs during R2
// runs (same port, same JWKS from research/r1/lib/polis.mjs, so R1 still works).
// It serves:
//   /embed.html, /r1-embed.js        R1's embed page, unchanged
//   /embed-r2.html                   R2 embed page (optional reset step, see r2-embed.js)
//   /embed-r2-noref.html             same page sent with "Referrer-Policy: no-referrer"
//   /embed-r2-rp.html?rp=<policy>    same page with any Referrer-Policy
//   /r2-embed.js
//   /.well-known/jwks.json           the local test issuer (Pol.is JWKS_URI)
//
// It listens on 127.0.0.1 and ::1, so it is reachable as http://localhost:8190
// (same site as Pol.is) and http://127.0.0.1:8190 (a different site).
// Request logging: none.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOST_PORT, R1_DIR, jwks } from "../../r1/lib/polis.mjs";

const R2_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = "text/html; charset=utf-8";
const js = "text/javascript; charset=utf-8";

const files = {
  "/embed.html": [html, join(R1_DIR, "host", "embed.html"), {}],
  "/r1-embed.js": [js, join(R1_DIR, "host", "r1-embed.js"), {}],
  "/embed-r2.html": [html, join(R2_DIR, "host", "embed-r2.html"), {}],
  "/embed-r2-noref.html": [html, join(R2_DIR, "host", "embed-r2.html"), { "Referrer-Policy": "no-referrer" }],
  "/r2-embed.js": [js, join(R2_DIR, "host", "r2-embed.js"), {}],
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
  // /embed-r2-rp.html?rp=<policy>: the R2 page with any Referrer-Policy (test host only).
  if (path === "/embed-r2-rp.html") {
    const rp = new URL(req.url, "http://x").searchParams.get("rp") ?? "";
    res.writeHead(200, { "Content-Type": html, "Cache-Control": "no-store", ...(rp ? { "Referrer-Policy": rp } : {}) });
    res.end(readFileSync(join(R2_DIR, "host", "embed-r2.html")));
    return;
  }
  const f = files[path];
  if (!f) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": f[0], "Cache-Control": "no-store", ...f[2] });
  res.end(readFileSync(f[1]));
}

for (const host of ["127.0.0.1", "::1"]) {
  createServer(handler)
    .listen(HOST_PORT, host, () => console.log(`R2 host listening on http://${host.includes(":") ? `[${host}]` : host}:${HOST_PORT}`))
    .on("error", (e) => console.error(`R2 host could not bind ${host}:${HOST_PORT}: ${e.message}`));
}
