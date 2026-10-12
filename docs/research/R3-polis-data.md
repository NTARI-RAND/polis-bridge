<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# R3: Pol.is data, exports and personal data

Run on 2026-10-12 on the maintainer's Windows 11 machine, on the same stack and
fixtures as R2 (`docs/research/R2-polis-gating.md`).

Terms used:
- **xid**: the pseudonymous ID the bridge gives Pol.is for one member in one round (PLAN.md §3: an HMAC, 32 hex characters).
- **pid / uid**: Pol.is's participant number inside one conversation / its internal user number.
- **owner**: the Pol.is account that created the conversation.
- **report**: a Pol.is object (`report_id`, e.g. `r3abc…`) that gives access to a conversation's results and CSV exports.
- **conversation UUID**: a second, longer ID Pol.is keeps for each conversation (`zinvites.uuid`).
- **bearer credential**: anything that lets whoever holds it act, with no further check.
- **CSP** (Content Security Policy): a response header telling the browser what a page may load.
- **PII**: personally identifiable information.

## Question

1. Which report export files and endpoints exist at the pinned SHA, which need a login, and can the bridge create the report itself?
2. Which tables join an xid to its participant and votes? Write and run the close-of-round audit ("every xid with votes is in the admitted set"), printing counts and pass/fail but no xids.
3. What personal data does Pol.is store or log by default (emails, IP addresses, user agents, social logins, request logs, nginx logs), where, and how can each be turned off, reduced or purged (including what the upstream purge-PII script really covers)? Can participant email and social login be turned off?
4. What data-minimizing configuration should Phase 2 use?

## Method

- **Upstream:** `https://github.com/compdemocracy/polis`, `stable`
  `30367002aa26c8796fd58aa8acf4203735e943bd`; code read at that SHA (code wins over docs).
- **Stack:** R2's (`polis-r1` compose project, four services, no rebuild), server in
  production mode (`DEV_MODE=false`, default `SERVER_LOG_LEVEL` = `warn`), nginx with
  R2's privacy log overlay. For the log-level check the server was recreated once
  more with `SERVER_LOG_LEVEL=error` (`.env.r3`, scratch only). Setup:
  `research/r2/README.md`.
- **Exports:** `node research/r3/tools/exports-probe.mjs` in round P (owner A,
  allow-list on): admits three random xids, votes through the API, creates a
  report through the API, fetches every export with and without a login, checks
  who can read the conversation UUID, tries an email subscription. Output:
  statuses and header rows only.
- **xid exposure:** `node research/r3/tools/xid-exposure-check.mjs` (counts only).
- **Audit:** `research/r3/sql/audit.sql`, run by `node research/r3/tools/run-audit.mjs <round> <admitted-set>`
  on rounds P, A, B and D. The admitted set goes to psql on stdin.
- **Personal data:** `information_schema` scan for personal-data-like columns,
  then `research/r3/sql/pii-inventory.sql` (counts only); `grep` of the server
  code for every writer of those tables; container logs of nginx, server and
  Postgres counted for xids, IPs and user agents (values redacted).
- **Roles:** `research/r3/sql/roles.sql` applied to the test database, checked with
  `SET ROLE`, then dropped again.
- **Third parties:** R2 browser tests W8 and W10 (Chromium, WebKit).

## Findings

### 1. Exports (Verified)

The bridge **can create the report itself**: `POST /api/v3/reports {conversation_id}`
with the owner's login → 200, then `GET /api/v3/reports?conversation_id=…` (owner
login) returns the `report_id`. Both need a moderator login; without one, listing
reports → 403 (`server/app.ts:1599-1650`, `server/src/routes/reports.ts`).

`GET /api/v3/reportExport/<report_id>/<file>` (`app.ts:404`, `server/src/routes/export.ts`)
**needs no login**: all eight files returned 200 without one.

| File | Header row (as returned) | Holds |
|---|---|---|
| `summary.csv` | `topic,"<topic>"` (key/value rows) | conversation summary |
| `comments.csv` | `timestamp,datetime,comment-id,author-id,agrees,disagrees,moderated,comment-body` | every statement's text and author pid |
| `votes.csv` | `timestamp,datetime,comment-id,voter-id,vote` | **every vote with its time** and voter pid |
| `participant-votes.csv` | `participant,group-id,n-comments,n-votes,n-agree,n-disagree,<one column per statement>` | per-pid vote matrix |
| `participant-importance.csv` | `participant,group-id,n-comments,n-votes,n-important,<…>` | per-pid importance flags |
| `comment-groups.csv` | `comment-id,comment,total-votes,total-agrees,total-disagrees,total-passes` | per-group results (empty without the math worker) |
| `comment-clusters.csv` | `comment-id,moderated,active,comment-body` | clusters (math worker) |
| `format.json` | `{"format":"polis-export/1",…}` | sign convention of the files above |

None of the report files contain xids, only pids. Other exports:

| Endpoint | Login | Content |
|---|---|---|
| `GET /api/v3/xid/<conversation-uuid>-xid.csv` (`app.ts:441`) | **none** | `participant,xid`: the full pid → xid map (6 rows in round P) |
| `GET /api/v3/conversationUuid?conversation_id=…` (`app.ts:735`) | **any** login: owner 200, unrelated signed-in account 200, **an ordinary participant's token 200**; none 401 | the UUID needed for the CSV above |
| `GET /api/v3/xids/csv`, `GET /api/v3/xids` (`app.ts:656-705`) | moderator (none → 401) | `pid,xid,vote_count` |
| `GET /api/v3/xidAllowList(/csv)` | moderator | the allow-list |
| `GET /api/v3/dataExport` (`app.ts:~390`) | login; queues a worker job | not tested (Inferred: needs the math/worker services) |

**The xid is a bearer credential, and Pol.is hands it out (Verified, chain run end to end).**
`xid-exposure-check.mjs`: member M votes and so gets an ordinary participant
token → with it reads the conversation UUID (200) → downloads the xid CSV with no
login (200, 6 xids) → sends `POST /api/v3/votes` with **another member's xid and no
token** → 200, and that member's recorded vote on statement 1 changed (1 → −1).
Pol.is identifies an xid participant by the xid string alone (R2 G4). So any
participant can read every other participant's xid during the round and vote,
or overwrite votes, as them; the audit cannot see it (the votes are under
admitted xids).

Also note: `votes.csv` gives every vote's timestamp per pid. Combined with
participant-creation times and the bridge's admission times, this is the
timing-correlation risk PLAN.md §3 mentions; the report should only exist after
close.

### 2. Joining xid → participant → votes, and the audit (Verified)

`votes(zid, pid)` → `participants(zid, pid).uid` → `xids(owner, uid).xid`, with
`xids.owner = conversations.owner` (`server/src/xids.ts` `getXids`; schema
`000000_initial.sql`, `000015_add_xid_requirements.sql`). Join on **(owner, uid)**,
not `xids.zid`: `xids.zid` is written only when Pol.is first creates the user,
so an xid reused in another round of the same owner keeps the first round's `zid`
(`createXidRecord` is only called for new users, `ensure-participant.ts:424-470`).
The audit found R2's cross-round voter in round B only through the owner join.
Statements also count as acting (`comments.pid`). The owner's account is a
participant too: creating seed statements with `vote: 0` gives it automatic "pass"
votes (round P: owner pid 0, 3 pass votes), so the audit allows owner pass votes
and fails any other owner vote.

`research/r3/sql/audit.sql` (inputs: `conversation_id` and the bridge's admitted
set) outputs: `conversation_found`, `admitted_xids`, `acting_participants`,
`participants_with_several_xids`, `owner_participants`, `ok_admitted`, `fail_no_xid`,
`fail_xid_not_admitted`, `owner_non_pass_votes`, `vote_rows`, `result`. Runs:

| Round | Admitted set used | acting | ok | no xid | xid not admitted | Result | Why |
|---|---|---|---|---|---|---|---|
| P | Pol.is allow-list (stand-in) | 7 | 6 | 0 | 0 | **PASS** | owner + 6 admitted xids |
| P | file with 3 of the 6 xids | 7 | 3 | 0 | 3 | **FAIL** | catches xids admitted to Pol.is but not by the bridge |
| A | Pol.is allow-list | 14 | 9 | 2 | 2 | **FAIL** | 2 signed-in accounts (R2 G6); 2 xids taken off the list by `replace_all` after voting (R2 G4) |
| B | Pol.is allow-list | 3 | 0 | 1 | 1 | **FAIL** | signed-in account (W7); xid reused from round A (G5) |
| D | Pol.is allow-list | 11 | 10 | 0 | 0 | **PASS** | |

The same query also ran as the read-only `bridge_audit` role (PASS on P), which
can read only the audit's columns (tested: reading `users` or
`participants_extended` is refused).

### 3. Personal data Pol.is stores (Verified unless marked)

Counts from `pii-inventory.sql` on the test database after R1–R3 (173 users, 155 xids, 180 participants):

| Where | What | Default state | Turn off / reduce / purge |
|---|---|---|---|
| `users.email`, `hname`, `username` | OIDC (signed-in) accounts only: 18 of 173 users. xid participants' user rows are empty. `username` is the e-mail's local part (`create-user.ts:69-70`). | stored on first login | Only operators should have accounts (R2). Purge script blanks `email`, `hname` only. |
| `oidc_user_mappings.oidc_sub` | identity-provider subject per account | stored | not covered by any script; delete row with the user |
| `xids.xid` | the pseudonym (155 rows) | stored | needed for the audit; meaningless once the round key is destroyed |
| `xids.x_name`, `x_email`, `x_profile_image_url` | 0 rows | only if sent | bridge never sends `x_*` |
| `xid_whitelist.xid` | admitted xids | stored | same as `xids` |
| `participants_extended.referrer` | the Referer of the first `participationInit` = **the iframe URL including `xid=` and `parent_url=`**: 128 of 131 non-empty rows contain an xid | always written when a Referer arrives (`server/src/participant.ts:281-288`) | cannot be turned off; keep `parent_url` free of query strings (bridge); purge after close (SQL below) |
| `participants_extended.parent_url`, `origin` | 0 rows (`participationInit` does not read them) | | — |
| `participants_extended.subscribe_email` | e-mail for "notify me" | **still accepted when `subscribe_type=0`**: `POST /api/v3/convSubscriptions` with a participant token → 200 and the e-mail was stored (`app.ts:587`) | block that route and `/api/v3/notifications/*` at the proxy; purge script covers this column |
| IP address in the database | none: the encrypted IP columns were dropped (migration 000007); the code that would write them still runs if `APPLICATION_NAME=PolisWebServer` (`participant.ts:292`) and the probe's query on `encrypted_ip_address` failed with "column does not exist" | none | never set `APPLICATION_NAME=PolisWebServer` (Inferred: it would also break participant creation) |
| `comments.txt` | statements' free text (75 rows), public in `comments.csv` | stored | moderation; tell members not to post personal data |
| `facebook_users`, `twitter_users`, `participant_locations`, `demographic_data` | 0 rows; **no server code writes them** at this SHA | dead tables | social login does not exist any more; nothing to turn off |
| `einvites`, `email_validations`, `inviters` | 0 rows; written only by invite/e-mail flows we do not use | | — |
| `metrics` (uid, timings) | 0 rows; `POST /api/v3/metrics` | | — |

**Participant e-mail can be turned off for the UI** (`PUT /api/v3/conversations
{subscribe_type: 0}` plus `data-subscribe_type="0"` in the embed: no prompt, R1 C1),
**but not at the server**: the API still accepts and stores an e-mail, so the
proxy must block the route. **Social login is already gone** at this SHA
(only OIDC for operators). Participant sign-in exists only through the
identity provider (R2: lock it down).

### 4. Personal data Pol.is logs or sends out by default (Verified unless marked)

| Where | What, by default | Evidence |
|---|---|---|
| nginx-proxy access log (Docker container log) | upstream nginx `main` format: client IP, full request line **with query string (xid)**, Referer (iframe URL with xid), user agent | R1: 776 lines with `xid=`. With R2's overlay format: 810 lines, **0 with `xid=`, 0 with `?`** |
| server request log, `DEV_MODE=false` | `http_request` JSON per request: full URL with query, client IP, user agent (`server/src/server-middleware.ts:50-90`); emitted at `info` for 2xx, `warn` for 4xx, `error` for 5xx. Default level is `warn`, so successful votes are **not** logged but refused ones are | 45 lines, 25 with an xid in the URL, all with IP + UA. With `SERVER_LOG_LEVEL=error`: **0** URL, xid or IP lines after a 403, a 400 and a 200 |
| server warnings | `"Domain not whitelisted"` logs the full Referer (with xid) at `warn` | 4 lines with xids |
| server request log, `DEV_MODE=true` | `morgan("dev")`: every URL with query string | R1: 272 lines with `xid=` |
| server error handler | `request_error` logs the URL at `error` level (`server-middleware.ts:~140`) | Inferred: still logged with `SERVER_LOG_LEVEL=error`, only on unhandled 5xx |
| client IP the server sees | upstream nginx does not set `X-Forwarded-For`, so the server logged nginx's container IP (`172.19.0.5`) for all 45 lines. Express trusts one proxy hop (`app.ts` `trust proxy 1`) | Inferred: if NTARI's TLS proxy adds `X-Forwarded-For`, nginx passes it through and the server logs the real client IP |
| Postgres log | errors with the failing statement | 0 xids in this run; Inferred: a failing allow-list insert (values inlined, `routes/xids.ts:417-432`) would log xids |
| `server-logs` volume (`/app/logs`) | empty; only used with `SERVER_LOG_TO_FILE=true` | `ls /app/logs` empty |
| Docker logs | `json-file` driver, **no size limit**, kept until the container is removed (`docker inspect`: `LogConfig {}`) | |
| Third parties from the participation page | **every page load** fetches `scripts.simpleanalyticscdn.com/latest.js` (`client-participation/public/index.ejs:21`, not switchable) and `cdn.jsdelivr.net/npm/jwt-decode@latest/...` (`index.ejs:36`, unpinned `@latest`); Google Analytics only if `GA_TRACKING_ID` is set (`index.ejs:8-17`). Each sees the member's IP and that they visited | W8 (both engines); voting works with both blocked; a CSP on the page blocks both (W10, both engines, vote 200, 0 external requests completed) |

Docs vs code: `docs/configuration.md:174-175` presents Simple Analytics as an
optional reporting feature (`SIMPLE_ANALYTICS_API_KEY`), but the script tag in
the participation page is unconditional. Trust the code.

### 5. The purge script (Verified, read)

`bin/purge-pii.clj <email>` (Babashka) finds one user by e-mail and sets
`users.hname`, `users.email` and `participants_extended.subscribe_email` (for that
uid) to NULL. It does **not** touch `users.username` (the e-mail's local part),
`oidc_user_mappings`, `xids.x_*`, `participants_extended.referrer/parent_url/origin`,
`comments`, `einvites`/`email_validations`/`inviters`, any log, or backups. It is
keyed by e-mail, so it cannot address xid participants at all.
`bin/anonymize_users.sh` rewrites e-mails and xids for development copies; not for production.

### 6. Narrow database roles (Verified)

`research/r3/sql/roles.sql`: `bridge_admit` (insert allow-list rows only) and
`bridge_audit` (read-only, audit columns only). Applied to the test database:
allowed statements worked; `DELETE` on `xid_whitelist`, `UPDATE votes`, and reading
`users`, `xids` (admit role) or `users`, `participants_extended` (audit role) were all
refused. Roles dropped afterwards.

## Sources

- Upstream: https://github.com/compdemocracy/polis, `stable` `30367002aa26c8796fd58aa8acf4203735e943bd`.
- Code at that SHA: `server/app.ts` (`:404` reportExport, `:441` xid CSV, `:587` convSubscriptions,
  `:656-717` xids/allow-list, `:735` conversationUuid, `:775` participation, `:1599-1650` reports,
  `:261-267` loggers); `server/src/routes/export.ts`; `server/src/report.ts:947` (`sendParticipantXidsSummary`);
  `server/src/routes/conversationUuid.ts`; `server/src/routes/reports.ts`; `server/src/routes/notify.ts:467`;
  `server/src/xids.ts`; `server/src/auth/ensure-participant.ts:405-470`; `server/src/auth/create-user.ts:54-90`;
  `server/src/participant.ts:273-312`; `server/src/server-middleware.ts:50-90`; `server/src/utils/logger.ts`;
  `server/src/config.ts`; `server/postgres/migrations/000000_initial.sql`, `000007_drop_geolocation_fields.sql`,
  `000015_add_xid_requirements.sql`; `client-participation/public/index.ejs:8-36`;
  `file-server/nginx/nginx-ssl.site.default.conf`; `bin/purge-pii.clj`; `bin/anonymize_users.sh`;
  `docs/configuration.md:53-66, 118-129, 174-184`; `docker-compose.yml:90-135, 421-443`.
- Spike code (this branch): `research/r3/` (README, `tools/exports-probe.mjs`,
  `tools/xid-exposure-check.mjs`, `tools/run-audit.mjs`, `sql/audit.sql`,
  `sql/pii-inventory.sql`, `sql/roles.sql`); `research/r2/` (stack overlay, tests W8/W10).
- R1/R2 notes: `docs/research/R1-polis-baseline-desk.md`, `R1-polis-baseline-handson.md`, `R2-polis-gating.md`.

## Recommendation

**Biggest finding: an xid is a password, and Pol.is gives every participant
everyone else's.** Before any pilot, NTARI's proxy must make the xid map
unreachable from outside, and the round must not run on a configuration where
it is reachable.

**Data-minimizing configuration for Phase 2** (proposal; nothing outside the
scratch stack was changed):

1. **Pol.is server `.env`:**
   ```
   DEV_MODE=false
   API_PROD_HOSTNAME=polis.<domain>        # our Pol.is host (CORS, R2)
   SERVER_LOG_LEVEL=error                  # no request URLs/IPs for 2xx/4xx (verified)
   SERVER_LOG_TO_FILE=                     # keep logs out of the server-logs volume
   APPLICATION_NAME=                       # never PolisWebServer
   GA_TRACKING_ID=
   SIMPLE_ANALYTICS_API_KEY=
   SHOULD_USE_TRANSLATION_API=false        # would send statement text to Google (Inferred)
   AKISMET_ANTISPAM_API_KEY=
   ANTHROPIC_API_KEY=  OPENAI_API_KEY=  GEMINI_API_KEY=   # LLM features off
   MAILGUN_API_KEY=  ADMIN_EMAILS=[]  ADMIN_UIDS=[]
   JWT_PRIVATE_KEY=… JWT_PUBLIC_KEY=…      # required (R1)
   ```
   And per conversation: `use_xid_whitelist=true`, `xid_required=true`, `subscribe_type=0`.
2. **nginx (Pol.is's proxy and NTARI's TLS proxy):** an access log without IP,
   query string, Referer or user agent (verified):
   ```
   log_format bridge_privacy '$time_iso8601 "$request_method $uri $server_protocol" $status $body_bytes_sent $request_time';
   access_log /dev/stdout bridge_privacy;
   error_log /dev/stderr crit;   # Inferred: error lines quote the request line
   ```
   Do not send `X-Forwarded-For` to Pol.is (or overwrite it with a constant), so its
   server never sees member IPs. (Inferred.)
3. **Block at the public proxy** (return 404), with the bridge reaching Pol.is
   over the internal Docker network or the `bridge_audit` role instead:
   `/api/v3/xid/` (public xid map), `/api/v3/conversationUuid`,
   `/api/v3/convSubscriptions`, `/api/v3/notifications/`, and
   `/api/v3/reportExport/` until the round is closed. (Inferred: none of these is
   needed by the participation page; Phase 2 must confirm with a recorded session.)
4. **Response headers on Pol.is HTML pages** from the proxy:
   `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors https://vote.<domain>`
   (verified in Chromium and WebKit as a page-route simulation: voting works, no
   third-party request completes, other sites cannot frame it). Do not add a `Referrer-Policy` there (R2).
5. **Docker logging** for all Pol.is services: `logging: {driver: local, options: {max-size: "10m", max-file: "3"}}`
   so logs rotate instead of growing forever; consider `driver: none` for nginx-proxy.
6. **After close**, once the bundle is hashed and the audit has passed, purge
   per-round leftovers (proposal, not run):
   ```sql
   UPDATE participants_extended SET referrer = NULL, parent_url = NULL, origin = NULL, subscribe_email = NULL
   WHERE zid = (SELECT zid FROM zinvites WHERE zinvite = :'conv');
   ```
   The `xids` rows stay (the audit and any re-audit need them) but mean nothing once the round key is destroyed.
7. **Audit:** `research/r3/sql/audit.sql` with the bridge's own admitted set,
   through the `bridge_audit` role; the report is created automatically at close
   through the API (`POST /api/v3/reports`), so no report exists during the round.

**Decisions for Gate 1:**
- Accept that xids are bearer credentials inside Pol.is, and require the proxy
  blocks in item 3 (and logs without query strings) as a precondition for any
  round. Optionally file an upstream issue: `conversationUuid` should require a
  moderator, and the xid CSV a login.
- When results become public: report and exports created only at close
  (recommended), then published with the hash.
- Third-party scripts: block by CSP on our proxy (recommended, no upstream change)
  or patch the participation page (needs a `patches/` decision).
- Post-close purge of `participants_extended` (recommended) and Docker log
  rotation length (proposal: 3 × 10 MB per service).
- How the bridge reads Pol.is at close: internal API with the operator login, or
  the `bridge_audit` database role (recommended for the audit, read-only).
