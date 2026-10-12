<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# R1 (desk part): Pol.is baseline and xid embedding

Date: 2026-10-12. Scope: reading source code and GitHub threads only. Nothing was built or run. The hands-on part of R1 (docker compose, Playwright in three browsers) is still to do.

## Question

Before the hands-on run, what does upstream Pol.is say about:

1. Its default branch, latest commit, releases, and the two participation clients. Which client does the default `docker compose` serve, and how is the choice made?
2. How `embed.js` passes `data-xid` and the other `data-*` settings to the iframe and the API. Are the reported bugs fixed?
3. How an xid becomes a participant, what xid lengths and characters are allowed, and how votes are tied to it.
4. (Preview for R2.) The xid whitelist and the domain whitelist: how each is turned on and what the domain check looks at.
5. (Preview for R3.) Report exports, personal data stored by default, and the purge-PII script.

Terms used below:
- **xid**: an "external ID". The embedding site chooses a string that stands for one person. Pol.is links that string to an internal participant.
- **zid**: Pol.is's internal number for a conversation. The public `conversation_id` (such as `9hhmb5fufv`) maps to it.
- **uid / pid**: `uid` is an internal user number. `pid` is that user's participant number inside one conversation.
- **owner**: the Pol.is account that created the conversation.
- **JWT**: a signed token Pol.is gives the browser after the first visit, so later requests are recognized.
- **SSR**: server-side rendering. The page's first HTML is built on a server, not in the browser.

## Method

- Blobless clone (`git clone --filter=blob:none`) of `https://github.com/compdemocracy/polis` into a scratch folder. Read only. No scripts run, no installs, no builds.
- All file paths below are read at **edge `978fa11244532eb4efd44cbe27578e7ee2889f99`** (2026-10-12). `stable` is `30367002aa26c8796fd58aa8acf4203735e943bd` (2026-10-11). The only commits between them are a CI check and its revert (#3032, #3033). The key files (`client-participation/api/embed.js`, `client-participation-alpha/src/pages/embed.js.ts`, `server/src/auth/ensure-participant.ts`, `server/src/xids.ts`, `server/src/utils/domain.ts`) are identical on both. Every finding therefore holds for both SHAs.
- GitHub threads read with `gh` (read-only): PR #2304 (comments and reviews), discussions #1320, #1377 and #2441 (GraphQL), PR #1785, issues #2384, #2538, #2805 and #1848, PRs #2539 and #2540.
- "Verified" means read in the code at the SHA above. "Inferred" means it follows from reading but needs the hands-on run to confirm.

## Findings

### 1. Branches, releases, clients

- **Verified.** The default branch is `edge` (`origin/HEAD -> origin/edge`). `stable` is "the latest stable release after QA" (`CHANGELOG.md`). `VERSION` reads `1.0`. The repo has **no git tags and no GitHub releases** (`git ls-remote --tags` and `gh release list` both return nothing). Pinning must use a commit SHA.
- **Verified.** Both participation clients exist on the default branch:
  - **Legacy** (`client-participation/`, Backbone and webpack) is built into the `file-server` image (`file-server/Dockerfile`, stage "POLIS CLIENT PARTICIPATION").
  - **The rewrite** (`client-participation-alpha/`, Astro and React) runs as its own service, `client-participation-alpha`, on port 4321 (`docker-compose.yml` lines 61–83). PR #2304 ("client participation beta") was **merged into edge on 2026-02-17** as `257dde88`. Its changes landed in the `client-participation-alpha` folder.
- **Verified.** The default compose serves **both**. The URL path chooses between them:
  - `file-server/nginx/nginx-ssl.site.default.conf` sends `/alpha/*` (with the `/alpha` prefix removed) and `/_astro/*` to the alpha container.
  - Everything else goes to the Node server.
  - The Node server serves `/<conversation_id>` with the legacy client (`server/app.ts:2037` `fetchIndexForConversation`, which uses `staticFilesParticipationPort`; `server/src/conversation.ts:129`).
  - So `/<id>` and `/embed.js` give **legacy**, and `/alpha/<id>` and `/alpha/embed.js` give **the rewrite**.
  - No environment switch or feature flag chooses between them.

### 2. The embed path

**Legacy `embed.js`** (`client-participation/api/embed.js`):
- **Verified.** It reads `data-xid` (falling back to `xid` in the host page's `#hash` or `?query`), and also `data-x_name`, `data-x_profile_image_url`, `data-ucv`, `data-ucw`, `data-ucsh`, `data-ucst`, `data-ucsd`, `data-ucsv`, `data-ucsf`, `data-ui_lang`, `data-subscribe_type`, `data-parent_url` and others (`getConfig`).
- **Verified.** Each value that is set gets added to the iframe URL as a query parameter.
- **Verified.** `parent_url` defaults to the **full host-page URL** (`window.location`). The script also adds `referrer=document.referrer`.
- **Verified.** The iframe host is fixed at build time from `EMBED_SERVICE_HOSTNAME`, which falls back to `pol.is` (`client-participation/webpack.config.js:86`). Compose passes it through (`docker-compose.yml:491`).
- **Verified.** Inside the iframe, `client-participation/public/index.ejs` (around lines 66 and 378) reads `xid` from `window.location.search` only. It calls `/api/v3/participationInit?...&xid=...`, and `js/util/net.js` adds `xid` to every later API call.
- **Verified.** It also writes the xid to the browser console (`console.log("[Index] Added xid ...")`).
- **Verified.** `ucv`, `ucw`, `ucsh`, `ucst` and the other `uc*` flags only show or hide parts of the page (`js/util/utils.js` `userCanVote`/`userCanWrite`…, used in `js/views/participation.js`). **The server never sees or enforces them.** "Unset" means "allowed".

**Rewrite `embed.js`** (`client-participation-alpha/src/pages/embed.js.ts`, unchanged since #2304):
- **Verified.** It reads only `conversation_id`, `xid`, `x_name`, `x_profile_image_url`, `height`, `border`, `border_radius`, `padding`, `ui_lang`, `topic`, `auth_needed_to_vote` and `auth_needed_to_write`. **`ucv`, `ucw`, `ucsh`, `ucst` and the other `uc*` flags are not supported at all.** Nothing else in `client-participation-alpha/src` reads them either.
- **Verified.** It always sends `parent_url=window.location.href`, with no override.
- **Verified.** Its hostname comes from `PUBLIC_EMBED_HOSTNAME`, with fallback `'pol.is'`. Compose does not set that variable (it sets only `PUBLIC_SERVICE_URL`, `INTERNAL_SERVICE_URL`, etc.). So a default self-hosted build serves an `/alpha/embed.js` that **points the iframe at pol.is, not at our server**. Upstream's own Cypress test rewrites the hostname in the script to get around this (`e2e/cypress/e2e/alpha-client/embed.cy.js:71-77`).
- **Verified.** The rewrite does pass `xid` and `ui_lang` through:
  - The SSR page reads `xid`, `x_name`, `x_profile_image_url` and `ui_lang` from its URL (`src/pages/[conversation_id].astro:35-58`) and calls `participationInit` from the server side.
  - The browser code adds `xid` to later calls (`src/lib/net.ts:175-181`, `src/lib/auth.ts:32`).

**Status of the reported bugs:**
- **Verified (thread).** The PR #2304 report ("XID, ucsh, ucst … ui_lang are all broken", by xeeg, 2026-02-17, posted after the merge) became **issue #2384, which is still OPEN**. Its title covers the vote-500 bug that happens when a conversation has no topic.
- **Verified (code).** In the rewrite's embed, `ucsh`/`ucst` are **still missing**, because `embed.js.ts` has not changed since then.
- **Inferred.** `xid` and `ui_lang` look correctly wired in the rewrite's code. The "xid broken" part of the report was very likely the server bug below.
- **Verified.** Discussion #2441 (2026-03-12: a direct link with `?xid=` cannot vote on the first load) and issues #1848 and #2538 share one root cause. The server tried to create the xid record before the participant row existed, so `pid` stayed -1 and votes failed with a 500. **PR #2540 fixed this** (merged 2026-04-26, `9ca3fd4c`, contained in edge and stable). The fix is visible at `server/src/auth/ensure-participant.ts` around lines 480–500, which carries a comment citing #2538.
- **Inferred.** #2441 is fixed on current edge, but the hands-on run must confirm it. Issue #1848 (commenting with xid) is still marked open.

### 3. Server side: xid → user → participant → votes

- **Verified (schema)** (`server/postgres/migrations/000000_initial.sql` plus 000002 and 000015):
  - `xids(uid, owner, xid TEXT, x_profile_image_url, x_name, x_email, zid, pid, …)`, with `UNIQUE(owner, xid)`.
  - `users(uid, hname, email, …)`.
  - `participants(pid, uid, zid, …)`, with `UNIQUE(zid,pid)` and `UNIQUE(zid,uid)`.
  - `votes(zid, pid, tid, vote, weight_x_32767, created)` and `votes_latest_unique(zid,pid,tid,…)`.
  - A vote is tied to a person only through `pid` → `participants.uid` → `xids.uid`.
  - Watch the sign: in `votes`, −1 means Agree. The CSV export flips it (comment in the schema).
- **Verified (flow)** (`server/src/auth/ensure-participant.ts`):
  - With no JWT, `participationInit` or `POST /votes` carrying `xid` first looks up `getXidRecord(xid, zid)`. That matches on xid plus **the conversation's owner**, not on the conversation (`server/src/xids.ts`).
  - If no record exists, it runs the whitelist checks (`_handleUserIdentification`, around lines 171–185), creates an anonymous user (`createAnonUser`), creates the participant, then calls `createXidRecord(xid, owner, uid, zid, …)`.
  - `participationInit` uses `createIfMissing:false`, but xid users are still created on the first visit (around line 431).
- **Verified (validation).** The only check on an xid's form is `getStringLimitLength(1, 999)` on the `xid` parameter (`server/app.ts:1235` for participationInit, `:1266` for votes). The column is `TEXT` (the schema comment says "TODO add constraint to limit length"). There is **no regex and no character restriction**.
  - Lookups are exact and case-sensitive (`xid = $1`).
  - The allow-list "replace all" path compares in lower case (`server/src/routes/xids.ts`, around line 366).
  - Our planned 32-character lowercase hex xid fits with a wide margin and avoids every case and encoding pitfall.
- **Verified.** xids are unique **per owner account, not per conversation**. One xid used in two conversations owned by the same account maps to the same Pol.is user.
- **Verified (privacy-relevant).** `x_name`, `x_profile_image_url` and `x_email` are stored in `xids` if sent. The bridge must never send them.

### 4. Gating (preview for R2)

**xid whitelist:**
- **Verified.** The table is `xid_whitelist(owner, xid TEXT, created, zid)`. The `zid` column was added by migration 000015, so an entry can be scoped to one conversation. The conversation flags are `conversations.use_xid_whitelist` (default false) and `conversations.xid_required` (default false, from migration 000015).
- **Verified.** Check logic (`isXidAllowed` in `server/src/xids.ts`): first a `(zid, xid)` row, then an owner-wide row with `zid IS NULL`.
- **Verified.** There are three ways to turn it on and admit xids. All three are merged on edge and stable.
  - `PUT /api/v3/conversations` with `use_xid_whitelist` / `xid_required` (`server/app.ts:1447-1448`).
  - `POST /api/v3/xidAllowList` with `{conversation_id, xid_allow_list[], replace_all}` (`server/app.ts:684`, `server/src/routes/xids.ts`). It needs a **moderator's authenticated JWT** (`hybridAuth` plus `isModerator`) and inserts rows scoped by zid. There is also a `GET` and a CSV variant, and an admin UI in `client-admin/.../ParticipantManagement`.
  - The Babashka scripts from `5db8596` ("Script updates (#1768)", 2024-02-24, contained in edge and stable): `bin/activate-xid-whitelist.clj` sets the flag, and `bin/add-xid-whitelist.clj` (with PR #1785's batch fix, merged `85ce00f2`) inserts **owner-wide rows (zid NULL)**. That breadth is wrong for our per-round design.
- **Verified.** The branch `br/add-xid-whitelist` no longer exists on the remote. Its work is on edge.
- **Inferred.** Admission takes effect at once, because every check is a live database query with no caching in that path.
- **Verified gaps** (read in code; behavior to be confirmed hands-on):
  - **(a) The whitelist is checked only when a new user is created.** If an xid already has a record (`getXidRecord` finds it), or the request carries a valid JWT with a `uid`, the check is skipped (`ensure-participant.ts` around line 421, and `_handleUserIdentification`). So **removing** an xid from the list does not stop someone who has already joined.
  - **(b) Cross-round reuse.** Because lookups are per owner, an xid admitted and used in round A, under the same owner account, is found as an existing record in round B and **skips B's whitelist**. A member can read their own xid from the iframe URL, so they could try this.
  - **(c) Logged-in accounts skip the check.** A signed-in Pol.is account (OIDC) has a `uid` from its JWT and never reaches the whitelist check.
  - The planned close-of-round audit ("every xid with votes was admitted") catches all three. It is the real control, not the whitelist.

**Domain whitelist:**
- **Verified.** The table is `site_domain_whitelist(site_id, domain_whitelist, domain_whitelist_override_key)`, keyed by the owner's `site_id`.
  - It is set with `POST /api/v3/domainWhitelist` (moderator JWT). It is off when empty.
  - It is enforced only on `GET /api/v3/participationInit` (`denyIfNotFromWhitelistedDomain`, `server/app.ts:1234`). It is **not** enforced on votes.
- **Verified. What it inspects** (`server/src/utils/domain.ts:225-305`): the request's **`Referer` header**.
  - If that Referer contains `parent_url`, the request is treated as coming from inside an iframe, and the host in the decoded `parent_url` query value is checked.
  - Otherwise the Referer's own host is checked.
  - The `participationInit` request comes from inside the Pol.is iframe, so its Referer is the iframe URL, and the deciding value is the **`parent_url` parameter that `embed.js` builds from the embedding page's URL**.
  - A missing Referer gives an empty domain, which is refused once a whitelist is set.
  - Bypasses: `domain_whitelist_override_key` (the `dwok` parameter) skips the check, as do `DEV_MODE` with a `localhost` domain and test mode.
- **Inferred.**
  - Our embed page's own `Referrer-Policy` does not affect the check. It reads `parent_url`, which `embed.js` takes from `window.location`, not from the browser's Referer.
  - What matters is that Pol.is's pages keep a referrer policy that sends the full same-origin URL (browsers do this by default).
  - Anyone can forge `parent_url` in a hand-made link, so this whitelist is a convenience, not a security control.
  - The rewrite's SSR `participationInit` call is made from the Astro server with no Referer, so **turning on the domain whitelist probably breaks the rewrite**.
- **Verified.** This is separate from the `DOMAIN_WHITELIST_ITEM_01..08` environment variables, which control CORS (`addCorsHeader`). CORS is the rule for which other sites may call the API from a browser.

### 5. Data (preview for R3)

- **Verified. Exports:** `GET /api/v3/reportExport/:report_id/:report_type` (`server/app.ts:404`, `server/src/routes/export.ts`), with types `summary.csv`, `comments.csv`, `votes.csv`, `participant-votes.csv`, `participant-importance.csv`, `comment-groups.csv`, `comment-clusters.csv` and `format.json`. **These need no login.** Anyone with the report ID can download them.
- **Verified. xid ↔ pid mapping:** `GET /api/v3/xid/<conversation-uuid>-xid.csv` (`server/app.ts:441`, `sendParticipantXidsSummary` in `server/src/report.ts`). This also **needs no login**. A logged-in moderator route also exists, `GET /api/v3/xids/csv`.
  - The audit can join this mapping with `participant-votes.csv`, or run SQL directly over `votes → participants → xids` with `xids.owner = conversations.owner`.
- **Verified. Personal data stored by default:**
  - `participants_extended.referrer`, `parent_url` and `origin` are taken from the request (`server/src/participant.ts:273-312`). With the planned layout, these hold our embed page's URL.
  - IP addresses are stored **only** when `APPLICATION_NAME=PolisWebServer`. That setting is unset by default, and the IP columns were dropped (migration 000007).
  - `users.email` and `hname` exist for owners. `participants_extended.subscribe_email` stores emails from the email-subscribe prompt (`subscribe_type`, default 1 = email prompt; `data-subscribe_type=0` turns it off in legacy).
  - `xids.x_name`, `x_profile_image_url` and `x_email` are stored if sent.
  - The `facebook_users` and `twitter_users` tables still exist, but **no server code writes them**. Social login is gone, and sign-in is now OIDC (`oidc_user_mappings`).
  - Participant cookies are no longer issued. The legacy `pc` cookie is only read, for migration. Identity is now a JWT in the iframe's `localStorage` under `participant_token_<conversation_id>`, valid for one year.
- **Verified. Logs:**
  - In production mode (`DEV_MODE` false), every request is logged with its **full URL including the query string (so the xid), the client IP and the user agent** (`server/src/server-middleware.ts:65-80`).
  - In dev mode, `morgan("dev")` logs the URL with its query string.
  - Compose keeps server logs in the `server-logs` volume.
  - **Inferred:** nginx-proxy's default access log also records the URL and IP.
  - Result: the Pol.is host can link an xid to an IP address unless logging is reduced.
- **Verified. Purge script:** `bin/purge-pii.clj <email>` blanks only `users.hname`, `users.email` and `participants_extended.subscribe_email`, for one email address. It does not touch `xids.x_*`, `participants_extended.referrer/parent_url/origin`, or logs. `bin/anonymize_users.sh` is a dev-data scrubber that rewrites emails and xids. It is not for production.

## Sources

- Repo: https://github.com/compdemocracy/polis. edge `978fa11244532eb4efd44cbe27578e7ee2889f99`; stable `30367002aa26c8796fd58aa8acf4203735e943bd`.
- Files (at the edge SHA): `docker-compose.yml`; `file-server/Dockerfile`; `file-server/nginx/nginx-ssl.site.default.conf`; `client-participation/api/embed.js`; `client-participation/public/index.ejs`; `client-participation/js/util/utils.js`; `client-participation/js/util/net.js`; `client-participation/js/util/polisStorage.js`; `client-participation/webpack.config.js`; `client-participation-alpha/src/pages/embed.js.ts`; `client-participation-alpha/src/pages/[conversation_id].astro`; `client-participation-alpha/src/lib/net.ts`; `client-participation-alpha/src/lib/auth.ts`; `server/app.ts`; `server/src/auth/ensure-participant.ts`; `server/src/auth/jwt-utils.ts`; `server/src/xids.ts`; `server/src/routes/xids.ts`; `server/src/utils/domain.ts`; `server/src/participant.ts`; `server/src/routes/export.ts`; `server/src/report.ts`; `server/src/server-middleware.ts`; `server/src/conversation.ts`; `server/postgres/migrations/000000_initial.sql`, `000002_add_xid_constraint.sql`, `000007_drop_geolocation_fields.sql`, `000010_create_oidc_user_mappings.sql`, `000015_add_xid_requirements.sql`; `bin/activate-xid-whitelist.clj`; `bin/add-xid-whitelist.clj`; `bin/purge-pii.clj`; `bin/anonymize_users.sh`; `example.env`; `CHANGELOG.md`; `e2e/cypress/e2e/alpha-client/embed.cy.js`; `e2e/cypress/e2e/client-admin/participant-management.cy.js`.
- Commits: `5db8596c8117d6f66444bc7094a809672b20c9d1` (whitelist bin scripts); `85ce00f2277b19c2c105d9b84408e1dfde097360` (#1785); `257dde883a679be25bad72d405d2ad94ff00ce1f` (#2304 merge); `9ca3fd4cb5ebb55b49ea8346504a0ee4074b2bbd` (#2540 xid fix).
- Threads: https://github.com/compdemocracy/polis/pull/2304#issuecomment-3917697021 ; https://github.com/compdemocracy/polis/issues/2384 ; https://github.com/compdemocracy/polis/discussions/2441 ; https://github.com/compdemocracy/polis/issues/2538 ; https://github.com/compdemocracy/polis/pull/2540 ; https://github.com/compdemocracy/polis/pull/1785 ; https://github.com/compdemocracy/polis/discussions/1320 ; https://github.com/compdemocracy/polis/discussions/1377 ; https://github.com/compdemocracy/polis/issues/2805 ; https://github.com/compdemocracy/polis/issues/1848 .

## Recommendation

**Try first: `stable` at `30367002aa26c8796fd58aa8acf4203735e943bd` with the legacy client** (`/<id>` and `/embed.js`).
- stable is the QA'd branch, and its code is the same as edge's for everything R1 touches.
- Legacy is the only client that supports `ucv`/`ucw`.
- Legacy lets us set `data-parent_url` (so no full page URL reaches Pol.is).
- Legacy builds its embed hostname from compose's `EMBED_SERVICE_HOSTNAME`.
- Upstream's Cypress tests check the xid allow list against legacy.

Try the rewrite (`/alpha/...`) only as a second pass, after setting `PUBLIC_EMBED_HOSTNAME` at build time. For now, treat it as not ready for us: no `uc*` flags, forced `parent_url`, issue #2384 open, and a likely clash with the domain whitelist.

**The hands-on Playwright test must check these, in Chromium, Firefox and WebKit:**
1. A fresh profile opens the embed page with a 32-hex `data-xid` and votes on the first load. The vote returns 200, not 500. This rechecks #2441/#2538.
2. In the database, the vote's `pid` maps to a `participants.uid` whose `xids.xid` equals the xid sent, with `xids.zid` set to this conversation. The `/api/v3/xid/<uuid>-xid.csv` row matches.
3. `ucv=0` / `ucw=0` hide voting and writing. A direct `POST /api/v3/votes` still succeeds. This shows the flags are cosmetic.
4. `ui_lang` changes the page language.
5. Reload, and a new context with the same xid: the same `pid` comes back.
6. The longest xid we will use (32 hex) and a 999-character xid are both accepted, and a 1000-character xid is refused (`polis_fail_parse_string_too_long`).
7. **Shared browser:** two different xids in the same browser profile and the same conversation. Confirm the second xid's votes do not land under the first person's `pid`. This is the stored-JWT risk below.
8. Preview for R2: with `use_xid_whitelist=true`, a non-admitted xid gets 403 `polis_err_xid_not_allowed`. An xid admitted while the page is open works on its next request. A round-A xid opened in a round-B conversation (same owner) shows whether it skips B's list.
9. Record what lands in `participants_extended.parent_url/referrer/origin` and in the server and nginx logs.

**Go/no-go risks:**
- **GO-blocker if test 1 or 2 fails** on stable with legacy. The code reads correctly, but we have not watched it run.
- **Shared-browser identity mix-up (inferred, high impact).** On a later visit, the JWT stored for this conversation decides `uid`/`pid`, and the `xid` in the request is not compared with the xid in the JWT (`jwt_xid` is read but never set). Two members on one browser could merge into one participant. If test 7 fails, we need either a decision with a mitigation (for example, an instruction to use a personal device, or an upstream patch recorded under `patches/`) or a no-go.
- **The whitelist is not a hard gate.** Revoking does not work, reuse across rounds under the same owner skips the check, and logged-in Pol.is accounts skip it. Mitigations:
  - Rely on the close-of-round audit.
  - Turn off public sign-up on our instance.
  - Consider one Pol.is owner account per round, or at least never reuse xids. Our HMAC per conversation already does that.
  - Admit xids only through `POST /api/v3/xidAllowList` (scoped to one conversation), never through `bin/add-xid-whitelist.clj` (owner-wide).
- **Privacy floor vs Pol.is logging.** By default Pol.is logs the xid (in URLs), IP addresses and user agents. Phase 2 must cut this back, for example with a log filter or shorter retention for server and nginx logs. R3 should treat this as the main data finding.
- **Unauthenticated exports.** Report CSVs and the xid↔pid CSV are public to anyone holding the IDs. Treat report IDs and conversation UUIDs as secrets until close, or put them behind the proxy.
- **Domain whitelist** can be forged and is skipped in `DEV_MODE`. Use it only as a convenience. Set `data-parent_url` to an origin with no query string.
