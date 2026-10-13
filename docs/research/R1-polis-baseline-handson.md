<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# R1 (hands-on): Pol.is baseline and xid embedding

Run on 2026-10-12 on the maintainer's Windows 11 machine. Companion to the desk
note `R1-polis-baseline-desk.md`, which was **not present in the working tree
when this run started or finished**, so its nine checks could not be read. The
nine checks below (C1–C9, plus C5b) were derived from PLAN.md R1/R2 and the
spawning brief; reconcile the two lists when the desk note lands.

Terms used:
- **xid**: an "external ID" the embedding site passes to Pol.is to say who the voter is. Pol.is creates one participant per xid.
- **participant / pid**: Pol.is's record of one voter in one conversation.
- **embed.js**: the legacy Pol.is script a host page loads to show a conversation in an iframe.
- **iframe**: a page shown inside another page; here Pol.is inside the bridge's embed page.
- **JWT**: a signed token. Pol.is gives each participant one and the browser sends it back on later calls.
- **localStorage**: storage a website keeps in the browser. Pol.is keeps its participant token there, one per conversation.
- **xid whitelist (allow-list)**: a per-conversation list of xids allowed to take part.
- **domain whitelist**: a per-site list of host domains allowed to embed the conversation.
- **Referer**: the browser header that tells a server which page made a request.

## Question

Can NTARI's design (PLAN.md §3) rely on self-hosted Pol.is with the **legacy
`embed.js` client and a per-member `data-xid`**? Specifically, at a pinned
commit: do votes land under the xid's participant in Chromium, Firefox and
WebKit; do `ucv`/`ucw` work; what xid lengths and characters are accepted; and,
as previews for R2, do the xid allow-list and domain whitelist hold? Plus: what
happens when two members use the same browser one after the other?

## Method

**Upstream.** `https://github.com/compdemocracy/polis`, branch `stable` at
`30367002aa26c8796fd58aa8acf4203735e943bd` ("Promote edge to stable: import dry
run reports oversized families (#3031)", 2026-10-11). Default branch is `edge`.
Checked out with `core.autocrlf=false` (CRLF broke the Postgres init script and
nginx entrypoint on the first attempt; the server then refused to start with
"Migration history mismatch" until all images were rebuilt from an LF checkout).

**Clients at this SHA (Verified, by reading the tree and serving it).** The legacy
participation client (`client-participation/`, jQuery/Backbone) is still built
into the `file-server` image and served at `/<conversation_id>` and via
`/embed.js`. The rewrite (`client-participation-alpha/`, Astro) is a separate
service served under `/alpha/`. Only the legacy client was tested.

**Services.** Built and started only `postgres server file-server nginx-proxy`
with `--no-deps`, plus a local override `docker-compose.r1.yml` that gives
`file-server` the network alias `client-participation-alpha` (nginx's config
hard-codes that upstream and would not start otherwise). Not run: `math-python`
and `delphi` (the classic Clojure `math` service has been retired at this SHA;
its replacement shares the large `delphi` image with PyTorch, which the disk
budget did not allow), `client-participation-alpha`, `dynamodb`, `ses-local`,
`ollama`, `import-worker`, `minio`, `localstack`, coordinator. The server did
not need any of them for participation, voting, allow-lists or CSV export.

**`.env`** = upstream `example.env` with: `HTTP_PORT=8180`, `HTTPS_PORT=8543`
(port 80 is taken by another local stack), `EMBED_SERVICE_HOSTNAME=localhost:8180`,
`API_DEV_HOSTNAME=localhost:8180`, `PUBLIC_SERVICE_URL=http://localhost:8180/api/v3`,
`TAG=r1`, `GIT_HASH=<sha>`, `AUTH_ISSUER=https://r1-local-issuer.test/`,
`JWKS_URI=http://host.docker.internal:8190/.well-known/jwks.json`, and a
throwaway `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` pair. `DEV_MODE=true` (upstream
default) was left on; this matters for C8.

**Admin account.** Admin login at this SHA is OIDC only (no password login).
Instead of running upstream's OIDC simulator, the spike serves its own JWKS
(`research/r1/host/server.mjs`) and mints RS256 admin tokens for two local test
admins (`research/r1/lib/polis.mjs`). Pol.is auto-creates a user on first use
of a valid token. Steps, all through the public API
(`research/r1/tools/setup-conversations.mjs`):
1. `POST /api/v3/conversations` (topic, description, `is_active`).
2. `POST /api/v3/comments` five times with `is_seed: true` (five seed statements).
3. `PUT /api/v3/conversations` with `subscribe_type: 0`, and for the main
   conversation `use_xid_whitelist: true, xid_required: true`.
4. For the second admin's conversation: `POST /api/v3/domainWhitelist` with
   `domain_whitelist: "localhost:8190"`.
5. Tests admit xids with `POST /api/v3/xidAllowList` `{conversation_id, xid_allow_list: [...]}`.

**Embed page** (`research/r1/host/`): a `<div class="polis">` with
`data-conversation_id`, `data-xid`, explicit `data-parent_url` = origin + path
(no query string), `data-subscribe_type=0`, optional `data-ucv`/`data-ucw`,
then `embed.js` from `http://localhost:8180`. Served at `http://localhost:8190`
(same site as Pol.is, as PLAN.md's same-site layout intends) and at
`http://127.0.0.1:8190` (a different site, for the off-domain check). The xid
reaches the page through a test hook, never through the page URL.

**Test runner.** `@playwright/test` 1.61.0 (exact pin; Chromium 1228, Firefox
151.0 build 1532, WebKit 26.5 build 2311), one worker, Node 24.13.0, npm 11.6.2,
Docker 29.6.2, Compose 5.3.1. Every vote is checked in Postgres with
`docker exec polis-r1-postgres-1 psql`, joining `xids` → `participants` →
`votes`. Firefox could not start on this machine: Windows Smart App Control
blocks Playwright's Firefox build (`spawn UNKNOWN`; Code Integrity events 3033/3077).
Changing that is a security setting, so instead Firefox ran inside
`mcr.microsoft.com/playwright:v1.61.0-noble` via `playwright run-server`, with
`exposeNetwork: '<loopback>'` so its `localhost` traffic came back to this
machine. Same Firefox build, Linux instead of Windows.

Command (final run, fresh conversations):

```
PW_REMOTE_WS=ws://127.0.0.1:3000/ npx playwright test --project=chromium --project=webkit --project=firefox-docker
```

Memory was sampled every 4 s during that run with `docker stats --no-stream`.

## Findings

### Pass/fail per check and engine (final run, Verified)

| # | Check | Chromium | Firefox (in Docker) | WebKit |
|---|---|---|---|---|
| C1 | First-load vote via embed returns 200 and lands under the xid's participant (1 participant, 1 vote; `parent_url` has no query; `subscribe_type=0`; no email prompt) | pass | pass | pass |
| C2 | `ucv=false` hides voting | pass | pass | pass |
| C3 | `ucw=false` hides the statement form; `ucw=true` shows it | pass | pass | pass |
| C4 | 32-char lowercase hex xid works (browser); length/characters (API) | pass | pass | pass |
| C5 | Shared browser: second xid gets its own participant | **FAIL** | **FAIL** | **FAIL** |
| C5b | Shared browser: a non-admitted xid after an admitted one is refused | **FAIL** | **FAIL** | **FAIL** |
| C6 | xid whitelist on: non-admitted xid cannot vote (fresh browser) | pass | pass | pass |
| C7 | Admitting an xid at runtime works immediately | pass | pass | pass |
| C8 | Domain whitelist: off-domain embed refused, approved domain works | pass | pass | **FAIL** |
| C9 | Direct link `/<conv>?xid=` votes on first load (discussion #2441) | pass | pass | pass |

Evidence for each row is in each test's annotations (`test-results/results.json`; the final
run's copy was kept locally as `research/r1/.local/results-final.json`, gitignored).

### 1. Core embedding works in all three engines (Verified)

C1, C9: the first vote on first load returned HTTP 200 and Postgres showed
exactly one participant for the xid with one vote, and the conversation's
participant count went up by exactly one (no stray anonymous participant).
The "xid fails on first load" report (discussion #2441) did **not** reproduce
at this SHA with the legacy client, either embedded or as a direct link.

### 2. `ucv` and `ucw` work (Verified)

With `data-ucv=false` the Agree button never rendered. With `data-ucw=false`
the statement box was hidden; with `ucw=true` it showed. Same in all engines.

### 3. xid length and characters (Verified)

Through the API: a 64-char hex xid, a 999-char xid and `r1-xxxxxxxx_.~:@`
were accepted (200); a 1000-char xid was rejected (400). The server declares
`xid` as a string of length 1–999 (`server/app.ts`, `getStringLimitLength(1, 999)`);
the `xids.xid` column is unbounded `text`. PLAN.md's 32 lowercase hex characters
are well inside the limit. Note: xids are unique per conversation **owner**
(`UNIQUE (owner, xid)`), not per conversation; per-round derived xids avoid any clash.

### 4. Shared browser: the second member's votes go to the first member (Verified)

C5 in every engine: member A votes; then, in the same browser, the embed loads
with member B's xid and B votes. Postgres shows **A's participant with 2 votes
and no participant or xid record for B at all**. The network log shows why: the
second load sent `Authorization: Bearer <token whose xid is A>` on both
`participationInit` and `votes`. Pol.is stores its participant token in its own
origin's localStorage under `participant_token_<conversation_id>` (keyed by
conversation, not by xid; `client-participation/js/util/polisStorage.js`), and
the server trusts the token over the `xid` sent with the request
(`server/src/auth/ensure-participant.ts`, `_handleUserIdentification` returns
the token's uid when present). Because Pol.is keeps only the latest vote per
participant and statement, B's votes **overwrite** A's on any statement both
voted on.

C5b: the same happens when B's xid was **never admitted**: B votes (200) as A.
The allow-list check is skipped because the token already identifies a user.

Consequences (Inferred from the above): (a) a shared or borrowed device silently
merges two members into one vote; (b) the PLAN.md §3 audit ("every xid with
votes was admitted") cannot detect it, because the votes are recorded under an
admitted xid; (c) participant tokens last one year (`JWT_EXPIRATION_SECONDS` in
`server/src/auth/jwt-utils.ts`; Verified in code), so the effect persists across days of a 7-day round.

### 5. Participant tokens need configuring (Verified)

With upstream `example.env` as shipped, the server has no participant-JWT key
(`JWT_PRIVATE_KEY_PATH=/app/keys/jwt-private.pem` does not exist in the image).
Votes still succeed, but the server logs "Failed to issue JWT" and returns no
token. In that state C5 *passed* (each load identified the voter by the xid
alone). Once the keys were set (as production must), C5 failed. Production
behaviour is the keyed one. A deployment that deliberately leaves the keys out
avoids the merge but runs Pol.is on an error path (Inferred; not recommended
without upstream confirmation).

### 6. xid allow-list works and takes effect at once (Verified, R2 preview)

C6: with `use_xid_whitelist` on, a fresh browser with a non-admitted xid never
got a voting UI and nothing was written. C7: before admission
`POST /api/v3/votes` answered `403 polis_err_xid_not_allowed`; immediately after
`POST /api/v3/xidAllowList` the same xid voted (200) through the embed. No
direct database write was needed; admission is an authenticated owner API call.

### 7. Domain whitelist: WebKit escapes it here (Verified), and may break in production (Inferred)

C8, Chromium and Firefox: the off-domain embed (`127.0.0.1:8190`) got
`403` on `participationInit`; the approved domain (`localhost:8190`) voted.
The server finds the parent domain by reading `parent_url=` out of the Referer
of the iframe's API calls (`server/src/utils/domain.ts`).

WebKit: off-domain, the Referer was trimmed to `http://localhost:8180/` (no
`parent_url`), so the server read the domain as `localhost:8180`, and
`DEV_MODE=true` waves through any domain starting with `localhost`. The
off-domain embed voted. On the approved (same-site) domain WebKit sent the full
Referer. Inferred for production (`DEV_MODE=false`): an off-domain WebKit embed
would be judged by the Pol.is host's own name, so it is refused unless that
host is itself on the whitelist, and listing it would let any off-domain WebKit
embed through. The domain whitelist is therefore at best a soft control; the
xid allow-list is the real gate. R2 should confirm with `DEV_MODE=false`.

### 8. The xid travels in URLs and lands in logs (Verified)

`embed.js` puts the xid in the iframe's query string. That full URL then appears
in the nginx access log (762 lines with `xid=` in this run), in the server's
request log (e.g. `GET /api/v3/votes/famous?...&xid=`), in the Referer of every
API call, and in the server's "Domain not whitelisted" warning. Next to client
IP addresses this links xid to IP inside the Pol.is host. CLAUDE.md's floor
("never log any URL with a query string") governs the bridge, but the same
concern applies to the Pol.is proxy and server logs; Phase 4 and R3 should
decide log settings.

### 9. Report export works without the math worker (Verified, R3 preview)

`POST /api/v3/reports` then `GET /api/v3/reportExport/<report_id>/<file>`
returned 200 for `summary.csv`, `comments.csv`, `votes.csv`,
`participant-votes.csv` and `comment-groups.csv`. `participant-votes.csv` is
keyed by participant number, not xid; mapping to xids needs the owner-only xid
export (`/api/v3/xids`). Group columns are presumably empty without math
(Inferred; not inspected).

### 10. Resource use (Verified, for R6)

Peak memory during the 30-test run (43 samples): server 130.5 MiB, Postgres
53.0 MiB, file-server 49.3 MiB, nginx 5.6 MiB; **sum ≈ 240 MiB**. Peak CPU:
server ~109 % of one core briefly. Images: server 1.72 GB, Postgres 439 MB,
file-server 262 MB, nginx 38 MB (≈2.5 GB). Builds needed roughly 2 GB more
in transient build cache (Rust for the migration tool, three Node client builds).
The math worker is not included in these numbers; its image is far larger.

### Other observations

- Admin login is OIDC-only at this SHA (Verified). The bridge's own admission
  calls will need an OIDC identity Pol.is trusts (or upstream's simulator in dev).
- `nginx-proxy` will not start without the `client-participation-alpha`
  upstream resolvable (Verified); the alias override is enough.
- When `server` is recreated, `nginx-proxy` must be restarted (it caches the old address; Verified).

## Sources

- Upstream repo: https://github.com/compdemocracy/polis, `stable` @ `30367002aa26c8796fd58aa8acf4203735e943bd`
- `docker-compose.yml`, `example.env`, `file-server/Dockerfile`, `file-server/nginx/nginx-ssl.site.default.conf`
- `client-participation/api/embed.js` (iframe URL built with `xid`, `parent_url`, `ucv`, `ucw`, `subscribe_type`)
- `client-participation/js/util/polisStorage.js` (token key `participant_token_<conversation_id>`)
- `client-participation/js/util/utils.js` (`ucv`/`ucw` parsing)
- `server/app.ts` (route parameters; `xid` 1–999 chars)
- `server/src/auth/ensure-participant.ts`, `server/src/auth/jwt-utils.ts`, `server/src/auth/jwt-middleware.ts` (token-over-xid identity; whitelist checks; OIDC admin)
- `server/src/utils/domain.ts` (Referer/`parent_url` domain check, `DEV_MODE` localhost bypass)
- `server/src/routes/xids.ts` (`POST /api/v3/xidAllowList`)
- PLAN.md R1/R2/R3; discussion #2441 and PR #2304 were not re-read online for this run (not reproduced: #2441; not tested: the rewrite client from #2304)
- Spike code: `research/r1/` (README, `tests/xid-embed.spec.ts`, `lib/polis.mjs`, `tools/setup-conversations.mjs`, `host/`)
- Playwright 1.61.0; image `mcr.microsoft.com/playwright:v1.61.0-noble`

## Recommendation

**Go, with one design change required before Gate 1.** Pin Pol.is `stable` @
`30367002aa26c8796fd58aa8acf4203735e943bd` and the **legacy client via `embed.js`**.
Embedding with `data-xid`, first-load voting, `ucv`/`ucw`, 32-hex xids, the xid
allow-list and runtime admission all work in Chromium, Firefox and WebKit.

What must change: **one browser must never carry two members' xids for the
same conversation**, or the second member's votes are silently recorded as the
first's. Decisions needed for Gate 1:

1. **Shared-browser policy.** Options, cheapest first:
   - (a) The bridge detects it: on the join page, set a first-party bridge
     cookie holding a hash of the round and xid; if a different member arrives
     in a browser already used for that round, refuse to embed and tell them to
     use a private window or their own device. Needs no Pol.is change. Leaves
     the risk on devices where the cookie is cleared but Pol.is's localStorage is not (Inferred).
   - (b) Clear Pol.is's token before each embed by serving a tiny page on the
     Pol.is origin from NTARI's own reverse proxy (not an upstream change) that
     removes `participant_token_<conversation_id>` and then loads the
     conversation. Needs testing.
   - (c) Patch or ask upstream to treat a request whose `xid` differs from the
     token's xid as a new identity. Strongest, but CLAUDE.md requires a decision
     record, `patches/`, and publishing the patched source.
   Recommended: (a) for the MVP plus an upstream issue for (c).
2. **Domain whitelist is not a security boundary** (WebKit trims the Referer).
   Rely on the xid allow-list; treat the domain whitelist as optional. R2 to
   confirm with `DEV_MODE=false`.
3. **Pol.is logs contain xids** (URLs and Referers). Decide log retention or
   redaction for the Pol.is proxy and server (Phase 4).
4. **Admin identity for the bridge:** Pol.is admin is OIDC-only; Gate 2 needs an
   OIDC issuer the bridge can use for `xidAllowList` calls.
5. **Participant JWT keys must be set** in production (`JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`).

Follow-ups: rerun C1–C9 on a machine where native Firefox runs (here it ran
Linux Firefox in Docker); test the alpha client only if the legacy client is
ever dropped upstream; size the math worker (`math-python`/`delphi` image) for R6.

## Addendum: retest on stable d3d38ce (2026-10-13)

**Why.** Upstream merged a security fix, compdemocracy/polis#3048 (commit
`a00807119d33b1a22264716a2dba16e787d952f7`): only a conversation's owner or a
moderator can now get its conversation UUID or its invite codes, and a database
migration (000039) wipes every stored UUID. It reached `stable` in
`d3d38cec8bf81ec2c67fc870ed2abacc59ad0ff2` ("Promote edge to stable: owner
checks on invite routes, connection budget, embeddings tables (#3052)"). This
section reruns the R1 checks at that commit. Earlier sections are unchanged and
describe `30367002`.

**What changed upstream that could matter here (Verified, by reading
`git diff 30367002..d3d38cec` under `server/`, `client-participation/`,
`file-server/`, `server/postgres/`):**
- `server/src/routes/conversationUuid.ts` and the `zinvites` routes in
  `server/src/server.ts`: owner/moderator only (details in the R3 addendum).
- Migrations 000038 (Delphi embedding tables, plain `real[]`, no pgvector) and
  000039 (`UPDATE zinvites SET uuid = NULL`).
- `client-participation/public/index.ejs`: `jwt-decode` is now served from the
  Pol.is build (version 3.1.2) instead of `cdn.jsdelivr.net/...@latest`.
  Simple Analytics is still loaded on every page.
- `server/src/participant.ts`: a joiner that collides on a participant number
  retries once; lock waits are capped at 5 s. No change to how a voter is identified.
- Reports, exports and heavy admin reads now use their own one-connection
  database pool (`REPORT_EXPORT_POOL_MAX`, default 1).
- **Not changed:** `ensure-participant.ts` (token wins over xid), `xids.ts`,
  `routes/xids.ts` (allow-list), vote handling, `utils/domain.ts` (domain
  whitelist), request logging, `embed.js`, `polisStorage.js`, `file-server/`.

**Method.** Same machine, same compose project `polis-r1`, same four services
and `.env` (`DEV_MODE=true`). `server`, `file-server` and `nginx-proxy` were
rebuilt from an LF checkout of d3d38cec. To spare the machine a Rust compile,
the postgres image was **not** rebuilt: `queue-rs/polis-migrate` is identical at
both commits, so the new migration files were copied into the running
container and applied with its own `polis-migrate apply` (both applied; the
server started with no migration-history error). Chromium and WebKit only, one
worker, no traces. Firefox was not rerun.

**Results (Verified, final run 2026-10-13; 15 passed, 5 failed):**

| # | Check | Chromium 30367002 | Chromium d3d38cec | WebKit 30367002 | WebKit d3d38cec |
|---|---|---|---|---|---|
| C1 | First-load vote lands under the xid | pass | pass | pass | pass |
| C2 | `ucv=false` hides voting | pass | pass | pass | pass |
| C3 | `ucw` hides/shows the statement form | pass | pass | pass | pass |
| C4 | 32-hex xid; length 1–999 | pass | pass | pass | pass |
| C5 | Shared browser: second xid gets its own participant | FAIL | **FAIL** | FAIL | **FAIL** |
| C5b | Shared browser: non-admitted xid refused | FAIL | **FAIL** | FAIL | **FAIL** |
| C6 | Allow-list on: non-admitted xid cannot vote | pass | pass | pass | pass |
| C7 | Runtime admission works at once | pass | pass | pass | pass |
| C8 | Domain whitelist (`DEV_MODE=true`) | pass | pass | FAIL | **FAIL** |
| C9 | Direct link `/<conv>?xid=` votes on first load | pass | pass | pass | pass |

Nothing changed. The failures are the same and fail for the same reasons:
- C5/C5b: the second load sent the first member's token, and the first member's
  participant ended up with 2 votes and no record for the second xid.
- C8 in WebKit: the off-domain Referer was trimmed to `http://localhost:8180/`.

Evidence: `research/r1/.local/results-retest-d3d38ce.json` and
`retest-d3d38ce-run.log` (gitignored).

**Do the recommendations still stand?**
1. Shared-browser policy: **stands** (Verified: C5/C5b unchanged; the upstream
   fix did not touch token-over-xid identity). R2's mitigation (b) is still needed.
2. Domain whitelist is not a security boundary: **stands** (Verified for
   `DEV_MODE=true`; see the R2 addendum for production mode).
3. Pol.is logs contain xids: **stands** (Inferred: logging code and `embed.js`
   unchanged, not re-measured).
4. OIDC admin identity: **stands** (unchanged).
5. Participant JWT keys must be set: **stands** (unchanged).
6. The pin moves to `stable` @ `d3d38cec8bf81ec2c67fc870ed2abacc59ad0ff2`,
   because it contains the #3048 security fix (R3) and nothing in R1 regressed.
