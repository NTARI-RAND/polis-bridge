// SPDX-License-Identifier: AGPL-3.0-or-later
//
// R2/R3 spike: builds a local nginx config overlay for upstream's nginx-proxy
// container WITHOUT changing upstream source or rebuilding the image.
//
// Reads upstream's file-server/nginx/nginx-ssl.site.default.conf from the
// pinned clone, and writes research/r2/.local/overlay/default.conf.template
// with two additions:
//   1. A privacy access-log format: no client IP, no query string ($uri, not
//      $request), no Referer, no User-Agent. (R3 data-minimizing proposal.)
//   2. location = /bridge-reset.html, served from a bind-mounted folder: the
//      shared-browser mitigation (b) page (R2).
//
// Usage: node polis-overlay/make-overlay.mjs <path-to-polis-clone>
// Then start nginx-proxy with docker-compose.r2.yml (see research/r2/README.md).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const clone = process.argv[2];
if (!clone) throw new Error("usage: node make-overlay.mjs <path-to-polis-clone>");

const src = readFileSync(join(clone, "file-server", "nginx", "nginx-ssl.site.default.conf"), "utf8");

const logFormat = `# NTARI R2/R3 overlay: access log without IP, query string, Referer or User-Agent.
log_format bridge_privacy '$time_iso8601 "$request_method $uri $server_protocol" $status $body_bytes_sent $request_time';

`;
const serverAdditions = `
    # NTARI R2/R3 overlay: replaces the inherited "main" access log (which has
    # $remote_addr, the full $request incl. query string, Referer and UA).
    access_log /dev/stdout bridge_privacy;

    # NTARI R2 overlay: shared-browser mitigation (b), see bridge-reset.html.
    location = /bridge-reset.html {
        root /usr/share/nginx/bridge;
        add_header Cache-Control "no-store" always;
        add_header Referrer-Policy "no-referrer" always;
    }
`;

const marker = "    server_name _;\n";
if (!src.includes(marker)) throw new Error("upstream conf changed: server_name marker not found");
const out = logFormat + src.replace(marker, marker + serverAdditions);

const outDir = join(here, "..", ".local", "overlay");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "default.conf.template"), out.replace(/\r\n/g, "\n"));
console.log(join(outDir, "default.conf.template"));
