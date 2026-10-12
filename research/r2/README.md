<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# R2 spike: Pol.is gating (xid allow-list, domain whitelist, shared browser)

Research code for PLAN.md spike R2. Not production code. Findings:
`docs/research/R2-polis-gating.md`. Builds on `research/r1` (reuses its
`lib/polis.mjs`: throwaway local OIDC issuer, API client, psql helper, and its
embed page `host/embed.html` + `host/r1-embed.js`).

## 1. Run Pol.is in production mode (no rebuild)

Start from R1's setup (`research/r1/README.md`, section 1: pinned clone at
`30367002aa26c8796fd58aa8acf4203735e943bd`, `.env`, `docker-compose.r1.yml`,
images already built). Then, in the Pol.is clone:

```sh
# a production-mode copy of R1's .env
sed -e 's/^DEV_MODE=.*/DEV_MODE=false/' \
    -e 's/^API_PROD_HOSTNAME=.*/API_PROD_HOSTNAME=localhost:8180/' \
    -e 's/^DOMAIN_WHITELIST_ITEM_01=.*/DOMAIN_WHITELIST_ITEM_01=localhost:8180/' \
    -e 's/^SERVER_ENV_FILE=.*/SERVER_ENV_FILE=.env.r2/' .env > .env.r2
echo 'USE_NETWORK_HOST=true' >> .env.r2   # only because the test has no TLS proxy in front

# nginx overlay: privacy access log + /bridge-reset.html (no image rebuild)
node <polis-bridge>/research/r2/polis-overlay/make-overlay.mjs .

export SERVER_ENV_FILE=.env.r2 R2_DIR=<polis-bridge>/research/r2   # forward slashes on Windows
docker compose -p polis-r1 -f docker-compose.yml -f docker-compose.r1.yml \
  -f "$R2_DIR/polis-overlay/docker-compose.r2.yml" --profile postgres \
  up -d --no-deps --no-build postgres server file-server nginx-proxy
```

Why the extra settings: with `DEV_MODE=false` the server redirects plain-HTTP
requests to HTTPS unless a proxy sends `X-Forwarded-Proto: https`
(`USE_NETWORK_HOST=true` turns that off for this local test), and its CORS
check only accepts API calls from `API_PROD_HOSTNAME` or a
`DOMAIN_WHITELIST_ITEM_*` (the Pol.is origin itself must be one of them).

## 2. Run the checks

```sh
cd research/r2
npm ci
npx playwright test --project=api --project=chromium --project=webkit
```

One worker, Chromium and WebKit only, no traces. The run starts `host/server.mjs`
(port 8190; serves R1's page, the R2 page and the issuer's JWKS), creates fresh
fixtures through the admin API (`tools/setup.mjs`), then runs:

- `tests/api.spec.ts` (G1–G6, G8a): allow-list enable procedure and who may call
  it, refusal, runtime admission, removal, cross-round reuse, signed-in
  accounts, what the domain check reads.
- `tests/browser.spec.ts` (W1–W8): domain whitelist and `Referrer-Policy` in
  both engines, shared-browser control and mitigation (b), signed-in account in
  the same browser, third-party requests from the participation page.

Results: `.local/results.json` (gitignored), observations as annotations.
`R2_REUSE_STATE=1` reuses `.local/state.json`.

## Expected result at this SHA

All pass except **WebKit W2 and W2b (`strict-origin`, `origin`)**: in WebKit
the Pol.is iframe's own API calls follow the embedding page's
`Referrer-Policy`, so those policies strip `parent_url` and the domain check
refuses the voter. Those failures are findings, not test bugs.

## Files

- `host/` R2 embed page (`embed-r2.html`, `r2-embed.js`) and server
- `lib/r2.mjs` R2/R3 helpers on top of `research/r1/lib/polis.mjs`
- `polis-overlay/` nginx overlay generator, compose override, `bridge/bridge-reset.html`
- `tools/setup.mjs` fixtures; `tests/` the checks
- `.local/` (gitignored) generated nginx template, run state, results
