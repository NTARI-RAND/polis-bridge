<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# R2: Pol.is gating (xid allow-list, domain whitelist, shared browser)

Run on 2026-10-12 on the maintainer's Windows 11 machine, against the R1 stack.

Terms used:
- **xid**: the "external ID" the bridge gives Pol.is to stand for one member in one round.
- **allow-list** (Pol.is calls it the *xid whitelist*): the per-conversation list of xids allowed to take part.
- **domain whitelist**: a per-account list of websites allowed to embed that account's conversations.
- **owner / moderator**: the Pol.is account that created a conversation; a moderator is any account on the owner's "site" (in practice: the owner) or a Pol.is admin listed in `ADMIN_UIDS`.
- **signed-in account**: a Pol.is account that logged in through OIDC (the single sign-on service Pol.is trusts), as opposed to an xid participant.
- **participant token**: the signed token Pol.is stores in the browser after a first visit (valid one year).
- **Referer** (sic) header / **Referrer-Policy**: the header that tells a server which page made a request, and the setting a page uses to say how much of its own address the browser may put in it.
- **`DEV_MODE`**: Pol.is's development switch. R1 ran with it on; production runs with it off.
- **CSP** (Content Security Policy): a response header that tells the browser what a page may load and who may frame it.

## Question

1. Exactly how do we turn on and use the xid allow-list and the domain whitelist, and who is allowed to do it?
2. With `DEV_MODE=false`: what does the domain check actually look at (the Referer or the `parent_url` setting), and so which `Referrer-Policy` must the bridge's embed page send? Check in Chromium and WebKit.
3. Does a non-admitted xid stay out, does admission work at once, and can we admit without writing to the database? If not, what database role would be enough?
4. The R1 desk caveats: does removing an xid stop someone who already joined? Does an xid admitted in round A get into round B of the same owner? Do signed-in accounts skip the list, and can public sign-up be turned off?
5. Shared browser (R1 C5/C5b): can a page on the Pol.is origin, served by our own proxy, clear Pol.is's stored participant token? Which mitigation is viable: (a) a bridge-side cookie, or (b) that page?

## Method

**Upstream.** `https://github.com/compdemocracy/polis`, `stable` at
`30367002aa26c8796fd58aa8acf4203735e943bd` (R1's clone, unchanged, LF checkout).
Legacy participation client (`/embed.js`). Code read at that SHA; when docs and
code differ, the code is taken as right.

**Stack.** R1's compose project `polis-r1`, only `postgres server file-server nginx-proxy`,
`--no-deps --no-build` (no image was rebuilt). Two config changes, both local and
outside upstream source:

1. Server in production mode, from a copy of R1's `.env` (`.env.r2`):
   `DEV_MODE=false`, `API_PROD_HOSTNAME=localhost:8180`, `DOMAIN_WHITELIST_ITEM_01=localhost:8180`,
   `USE_NETWORK_HOST=true`. The last three are needed because, with `DEV_MODE=false`,
   the server redirects plain HTTP to HTTPS unless a proxy says the request was HTTPS
   (`redirectIfNotHttps`, `server/src/utils/domain.ts:22`), and its CORS check
   (the rule for which sites may call the API from a browser) only accepts the
   Pol.is origin if it equals `API_PROD_HOSTNAME` or a `DOMAIN_WHITELIST_ITEM_*`
   (`addCorsHeader`, `domain.ts:65-150`). In production the TLS proxy sends
   `X-Forwarded-Proto: https`, so `USE_NETWORK_HOST` is a test convenience only.
2. nginx-proxy gets a generated config (`research/r2/polis-overlay/make-overlay.mjs`
   inserts two things into upstream's `file-server/nginx/nginx-ssl.site.default.conf`)
   and a read-only bind mount (`polis-overlay/docker-compose.r2.yml`): an access log
   without IP, query string, Referer or user agent (for R3), and
   `location = /bridge-reset.html` serving `polis-overlay/bridge/bridge-reset.html`
   on the Pol.is origin (mitigation (b)).

Exact commands are in `research/r2/README.md`.

**Accounts and fixtures** (`research/r2/tools/setup.mjs`, admin API only, no DB writes),
using R1's throwaway local OIDC issuer: account A owns rounds A, B and P
(allow-list on: `use_xid_whitelist=true`, `xid_required=true`, `subscribe_type=0`);
account B owns round D (allow-list on, and B's domain whitelist = `localhost:8190`);
account C is an unrelated signed-in account.

**Tests.** `@playwright/test` 1.61.0, one worker, Chromium and WebKit only (Firefox
skipped to keep the load down; nothing below depends on Firefox), no traces.
`tests/api.spec.ts` (G1–G6, G8a) calls the API directly; `tests/browser.spec.ts`
(W1–W10) drives the embed page at `http://localhost:8190` (same site as Pol.is) and
`http://127.0.0.1:8190` (a different site). Every vote is checked in Postgres.
Final run on fresh fixtures:

```
npx playwright test --project=api --project=chromium --project=webkit
```

28 passed, 3 failed (all three are the WebKit Referrer-Policy finding below).
W9/W10 (proxy headers) were added afterwards and run separately: 4 passed.
Results kept locally in `research/r2/.local/` (gitignored). Disk free on C: was
2.7 GB before and after.

## Findings

### 1. Turning on the allow-list (Verified)

- **Per conversation, by the owner, through the API.**
  `PUT /api/v3/conversations` with `{conversation_id, use_xid_whitelist: true, xid_required: true}`
  sets the two flags (`server/app.ts:1447-1448`; G1 read them back from
  `conversations`). With `use_xid_whitelist` on, a request with no xid is
  refused too (`polis_err_xid_required`), so `xid_required` adds nothing extra
  but is harmless.
- **Admitting xids**: `POST /api/v3/xidAllowList` with
  `{conversation_id, xid_allow_list: [..], replace_all?: bool}` (`app.ts:684`,
  `server/src/routes/xids.ts`). Rows are written with this conversation's `zid`
  (G1: one row, scoped to the conversation). Reading the list: `GET /api/v3/xidAllowList`
  (paginated) and `GET /api/v3/xidAllowList/csv`.
- **Auth**: a Pol.is login token (an OIDC access token from the trusted issuer,
  sent as `Authorization: Bearer …`) of a **moderator** of that conversation.
  G1: no token → 401; another signed-in account → 403
  `polis_err_post_xidAllowList_not_authorized`; owner → 200.
  **No database write is needed** to admit, so no special Postgres role is
  required. A narrow role is still specified for the case where the bridge
  should not hold a full owner login (`research/r3/sql/roles.sql`,
  `bridge_admit`: `INSERT (xid, zid, owner)` on `xid_whitelist` and `SELECT` on two
  mapping columns; tested: insert works, delete/update/reading votes, xids or
  users are refused).
- **Removing xids** has no endpoint of its own. The only way is
  `replace_all: true`, which deletes **every** row for that conversation not in
  the list sent, including owner-wide rows (`zid IS NULL`) of the same owner
  (`routes/xids.ts:357-412`). An empty list is refused (400), so the list can
  never be emptied through the API.
- The old Babashka scripts (`bin/add-xid-whitelist.clj`) write owner-wide rows; do not use them.

### 2. Allow-list behaviour (Verified unless marked)

| Check | Result |
|---|---|
| G2 non-admitted xid | `participationInit` and `POST /votes` → 403 `polis_err_xid_not_allowed`; nothing written to `xids`. |
| G3 runtime admission | Refused before, accepted on the very next request after `POST xidAllowList` (161 ms apart). No caching. (R1 C7 showed the same through the embed.) |
| G4 removal after joining | After `replace_all` removed xid X (0 rows left), X still voted: **200 with the xid alone** and 200 with its old token. A never-admitted control xid → 403. **Removing does not revoke.** |
| G5(i) used in A, then B (same owner) | Voted in B, **200**, a participant was created in B. **Reuse across rounds of one owner skips B's list.** |
| G5(ii) admitted to A, never used, tried in B | 403. The skip only happens once the xid has a Pol.is user. |
| G5(iii) admitted to A, then also admitted to B | `POST xidAllowList` for B returned 200, but **no row for B was added** (the table still has the old `UNIQUE (owner, xid)` constraint and the insert uses `ON CONFLICT DO NOTHING`), and the xid was **refused in B (403)**. A silent failed admission. |
| G6 signed-in accounts | Account C (not admitted, no xid) voted: **200**. C with a non-admitted xid: 200, recorded as C. A brand-new account minted by the trusted issuer voted on its first call (200); Pol.is created it on the fly with `is_owner = true`. |

Why (code, `server/src/auth/ensure-participant.ts`): the allow-list is checked
only inside `_handleUserIdentification` (`:160-185`), which runs only when the
request has no user yet. A request carrying a login token or participant token
already has a user; a request whose xid already has an `xids` row for this
**owner** is resolved to that user first (`:424`), because xids are unique per
owner, not per conversation (`server/src/xids.ts` `getXidRecord`).

**Public sign-up (Verified in code and G6).** Pol.is has no sign-up switch of its
own. Admin login is OIDC only, and any valid token from the configured issuer
(`AUTH_ISSUER`/`JWKS_URI`) creates a local user on first use
(`server/src/auth/create-user.ts:83`). So "turning off public sign-up" means
configuring the **identity provider** to refuse self-registration and to
issue tokens only to NTARI's operators. Every account it lets in is an owner
that can vote past any allow-list.

### 3. Domain whitelist, `DEV_MODE=false` (Verified)

**Enable:** the owner (any signed-in account, for its own site) calls
`POST /api/v3/domainWhitelist` with `{domain_whitelist: "vote.example.org"}`
(comma-separated, `*.example.org` wildcards allowed, `host:port` exact match;
empty = off). It applies to **all** conversations of that account's site.

**What it checks** (`denyIfNotFromWhitelistedDomain`, `domain.ts:270-305`, only on
`GET /api/v3/participationInit`, `app.ts:1234`): the **Referer** of that request.
If the Referer contains `parent_url=`, the host inside that value is checked;
otherwise the Referer's own host. `participationInit` is called by the Pol.is page
inside the iframe, so its Referer is the iframe's own address, which `embed.js`
built with `parent_url=<embedding page>`. So it is the `parent_url` value, carried
inside the Referer of the iframe's API call.

API view (G8a, round D, approved `localhost:8190`):

| `participationInit` Referer | Result |
|---|---|
| none | 403 `polis_err_domain` |
| iframe URL with `parent_url=http://localhost:8190/...` (hand-made) | **200**: forgeable by anyone making the request themselves |
| iframe URL with `parent_url=http://127.0.0.1:8190/...` | 403 |
| only the Pol.is origin | 403 |

`POST /api/v3/votes` with no Referer at all: **200**. The domain check is not
applied to votes, only to the first page load.

Browser view (W1–W4, both engines):

| Case | Chromium | WebKit |
|---|---|---|
| W1 approved site, bridge page default policy | votes | votes |
| W3 other site (`127.0.0.1:8190`) | refused (403) | refused (403). WebKit trims the Referer to the Pol.is origin; with `DEV_MODE` off that is no longer waved through, so R1's C8 WebKit escape is closed. |
| W4 approved site, but Pol.is page itself sent with `Referrer-Policy: no-referrer` | refused (no Referer) | refused |

**Which `Referrer-Policy` may the bridge's embed page send?** (W2, W2b)

| Bridge page policy | Chromium | WebKit | Referer of the iframe's own page load |
|---|---|---|---|
| (none, browser default) | votes | votes | bridge origin only |
| `no-referrer` | votes | **refused** | none |
| `same-origin` | votes | votes | **none** |
| `strict-origin` | votes | **refused** | bridge origin |
| `strict-origin-when-cross-origin` | votes | votes | bridge origin |
| `origin` | votes | **refused** | bridge origin |

In WebKit the Pol.is iframe's own API calls follow the **embedding page's**
policy (observed: with `no-referrer` WebKit sent no Referer at all on
`participationInit`; with `strict-origin`/`origin` it sent only `http://localhost:8180/`).
Chromium uses the Pol.is page's own (default) policy. So R1's desk inference
("our page's policy does not matter") is **wrong for WebKit**.
`same-origin` is the only tested policy that works in both engines **and** sends
nothing about the bridge to Pol.is.

**A stronger lock exists outside Pol.is (Verified, W9; simulated header).**
A `Content-Security-Policy: frame-ancestors https://vote.<domain>` header on Pol.is's
conversation pages (added by NTARI's proxy) made both engines refuse to show the
conversation inside a page on any other site: no voting UI, no participant
created. Unlike the domain whitelist, a hand-made request cannot fake it,
though it does not stop direct API calls either. (Simulated with Playwright
adding the header to the response; the nginx `add_header` itself is a Phase 2 task.)

### 4. Shared browser (Verified)

- **Where the token lives:** in Pol.is's origin, `localStorage` key
  `participant_token_<conversation_id>`. After a vote there was exactly that one
  key; `sessionStorage` was empty and Pol.is set **no cookies** (W5, both
  engines; code: `client-participation/js/util/polisStorage.js`,
  `public/index.ejs:220-280`).
- **Control (W5):** R1 C5 reproduced in production mode: the second xid's vote
  landed on the first member's participant, no participant for the second xid.
- **Mitigation (b) works (W6, Chromium and WebKit).** Before loading `embed.js`, the
  bridge page loads `<polis>/bridge-reset.html#c=<conversation_id>` in a hidden
  iframe. That static page (served by our nginx, not upstream code) removes the
  `participant_token_*` key and posts "done" to the parent; only then is the
  embed loaded (fail-closed after 5 s). Result: the second member got their own
  participant (1 vote), and when the first member came back on the same browser
  they got **their old participant** back (same pid, now 2 votes), because the
  xid alone identifies them. The conversation ID travels in the URL fragment,
  which browsers never send to servers, so the visit leaves no identifier in logs.
  The reset frame and the embed frame share one storage partition (same origin
  under the same top-level page), which is why this also works where browsers
  partition third-party storage.
- **Not covered by (b): a signed-in Pol.is account in the same browser (W7).**
  With an OIDC token in Pol.is-origin storage (simulated in the format the legacy
  client reads), the embed sent the **login token instead of the xid** on
  `participationInit` and `votes`: the vote went to account C, no xid participant
  was created, in both engines. Anyone who logs into Pol.is admin on a browser
  later used for voting turns that browser's votes into their own. The audit
  (R3) catches it as `fail_no_xid`.
- **(a) bridge-side cookie (Inferred, not built).** A first-party bridge cookie
  holding a hash of (round, xid) lets the bridge notice "a different member in
  a browser already used for this round" and refuse. It needs no Pol.is origin
  access, but it only detects, and it fails when the bridge cookie is cleared
  while Pol.is's `localStorage` is not (they are separate stores). It also
  needs the bridge to keep a linkable per-browser value.

### 5. Other observations

- (Verified, R3) **An admitted xid is enough to vote as that member, and any
  participant can download every participant's xid** (participant token →
  `GET /api/v3/conversationUuid` → public `/api/v3/xid/<uuid>-xid.csv`). This
  undercuts the allow-list from the inside; the fix is at NTARI's proxy. See
  `R3-polis-data.md` §1.
- (Verified, W8) The legacy participation page loads two third-party scripts,
  unconditionally: `https://scripts.simpleanalyticscdn.com/latest.js`
  (`client-participation/public/index.ejs:21`) and
  `https://cdn.jsdelivr.net/npm/jwt-decode@latest/...` (`index.ejs:36`, an
  unpinned `@latest`). Voting works with both blocked; a CSP on Pol.is pages
  blocks both in both engines (W10). Details in R3.
- (Verified) With `DEV_MODE=false`, a request whose Referer is a non-whitelisted
  site but has no `parent_url` gets a 500 from the CORS check, not a 403 (G8a,
  "approved host direct" case). Harmless, but confusing in logs.
- (Inferred, code) `ADMIN_UIDS` accounts are moderators of every conversation and
  so can also admit xids and vote unrestricted.

## Sources

- Upstream: https://github.com/compdemocracy/polis, `stable` `30367002aa26c8796fd58aa8acf4203735e943bd`.
- Code at that SHA: `server/app.ts` (routes: `:404`, `:441`, `:637-717`, `:1217-1266`, `:1447-1448`);
  `server/src/auth/ensure-participant.ts` (`:160-200`, `:405-470`); `server/src/xids.ts`
  (`getXidRecord`, `isXidAllowed` `:151`, `createXidRecord` `ON CONFLICT (owner, xid)` `:64`);
  `server/src/routes/xids.ts` (`handle_POST_xidAllowList`, `replace_all` `:357-412`, insert `:417-432`);
  `server/src/utils/common.ts` (`isModerator` `:89`); `server/src/utils/domain.ts`
  (`redirectIfNotHttps` `:22`, CORS `:65-150`, `isParentDomainWhitelisted` `:153`,
  `extractDomainFromReferrer` `:225`, `denyIfNotFromWhitelistedDomain` `:270`);
  `server/src/auth/create-user.ts:83`; `server/src/auth/jwt-utils.ts:16`;
  `server/postgres/migrations/000000_initial.sql:380-386` (`UNIQUE (owner, xid)` on `xid_whitelist`),
  `000015_add_xid_requirements.sql`; `client-participation/js/util/polisStorage.js`;
  `client-participation/public/index.ejs:8-36, 95-160, 215-280`; `file-server/nginx/nginx-ssl.site.default.conf`;
  `docs/configuration.md:118-129` (`DEV_MODE`, `USE_NETWORK_HOST`, `DOMAIN_WHITELIST_ITEM_*`).
- Docs vs code: `docs/configuration.md:129` says typical setups need no
  `DOMAIN_WHITELIST_ITEM_*`; in code, with `DEV_MODE=false` the Pol.is origin must
  equal `API_PROD_HOSTNAME` (default `pol.is`) or be listed, or the iframe's own
  API calls fail the CORS check (`domain.ts:65-150`). Trust the code; set
  `API_PROD_HOSTNAME` to our Pol.is host name.
- Spike code (this branch): `research/r2/` (README, `tests/api.spec.ts`, `tests/browser.spec.ts`,
  `tools/setup.mjs`, `lib/r2.mjs`, `host/`, `polis-overlay/`), reusing `research/r1/lib/polis.mjs`
  and `research/r1/host/`. `research/r3/sql/roles.sql` (narrow roles).
- R1 notes: `docs/research/R1-polis-baseline-desk.md`, `docs/research/R1-polis-baseline-handson.md`.
- Tooling: Playwright 1.61.0 (Chromium 1228, WebKit 26.5 build 2311), Node 24.13.0, Docker 29.6.2.

## Recommendation

**The allow-list works as an entry gate but not as a fence.** It stops new,
non-admitted xids and admission is instant through the API, but it does not
revoke, it does not stop reuse across rounds of the same owner, and it does not
apply to signed-in accounts. Keep the close-of-round audit (R3) as the real
control, and design around the gaps:

1. **Admit through the API** with a moderator login token. The bridge needs an
   OIDC identity Pol.is trusts (as R1 said). If Gate 1 prefers the bridge not to
   hold full owner rights, use the `bridge_admit` Postgres role instead (tested);
   either way the bridge must check that each admission really created a row
   for this `zid` (G5(iii) shows `POST` can return 200 and do nothing).
2. **One Pol.is owner account per round, or never reuse an xid across rounds.**
   PLAN.md's per-round HMAC already gives every member a different xid in every
   round, which closes G5. Do not add `x_*` fields.
3. **No revocation.** If a member must be removed mid-round, the bridge cannot
   do it in Pol.is. The audit will show their votes as "xid not admitted" only if
   the bridge's own admitted set drops them, so the audit must compare against
   the bridge's record, not Pol.is's list.
4. **Lock down sign-in** at the identity provider: no self-registration, only
   named operators; never use an operator's Pol.is login on a voting browser.
5. **Domain lock**: turn the Pol.is domain whitelist on (it is cheap) **and** have
   NTARI's proxy send `Content-Security-Policy: frame-ancestors https://vote.<domain>`
   on Pol.is pages; treat neither as a security boundary (votes go straight to
   the API without either check).
6. **Embed page `Referrer-Policy: same-origin`** (works in Chromium and WebKit,
   sends nothing about the bridge to Pol.is). Never `no-referrer`, `origin` or
   `strict-origin` there, and never add a Referrer-Policy to Pol.is's own pages.
7. **Shared browser: adopt mitigation (b)**: serve `bridge-reset.html` on the Pol.is
   origin from NTARI's proxy and load it before every embed. It is viable in both
   engines, needs no upstream patch and keeps the bridge stateless. (a) alone is
   weaker (detects only, separate store); it can be added later as a warning.
   Still file the upstream issue for (c) (server should treat an xid different
   from the token's xid as a new identity).

8. **Block the xid map at the proxy** (`/api/v3/xid/`, `/api/v3/conversationUuid`),
   or the allow-list protects nothing against other members (R3).

**Decisions for Gate 1:**
- Accept that the allow-list is not revocable and that the audit, compared
  against the bridge's own admitted set, is the control.
- Pol.is owner model: one owner for all rounds (relying on per-round xids) or
  one owner per round. Recommended: one owner, per-round xids.
- Admission path: API with an OIDC operator identity (recommended) or the
  `bridge_admit` database role.
- Shared-browser mitigation (b) on NTARI's proxy (recommended), with "use your
  own device" guidance as a backstop.
- Domain lock = Pol.is domain whitelist + CSP `frame-ancestors` on the proxy, and
  the embed page's `Referrer-Policy: same-origin`.
- Identity provider for Pol.is admin with self-registration off; who holds those accounts.
