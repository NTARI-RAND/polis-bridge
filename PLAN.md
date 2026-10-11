# Polis–Slack Bridge: Research and Development Plan for Claude Code

Status: draft for founder-board review, October 2026. Owner: NTARI.
Proposed repo (confirm at Gate 0): `NTARI-RAND/polis-bridge`

## How to start (for the human)

1. Create the empty repo and commit this file at its root as `PLAN.md`.
2. Open Claude Code in the repo and say: "Read PLAN.md and execute Phase 0."
3. Claude Code stops at every gate (§6) and waits. Record each decision in `docs/decisions/`, then tell it to continue.

## 1. Goal and scope

Members start in Slack and deliberate in a self-hosted Pol.is. Every vote is tied to an eligible member but never to a name. Slack supplies identity, Pol.is supplies deliberation and the opinion map, and a small bridge service joins them.

The MVP does exactly this and no more:

- A convener opens a round from Slack in one federation channel.
- An eligible member taps "Take part," receives a private single-use link, and votes in an embedded Pol.is conversation under a pseudonymous xid.
- At close, the bridge does three things:
  - posts the report link and a hash of the exported results;
  - writes a registry record;
  - runs an audit showing every participant entered through the eligibility check.

Two limits frame everything:

- A Pol.is round informs a decision. The binding vote still happens under the bylaws.
- The bridge is interim tooling under draft policy P1-005, not a JFA Governance-layer implementation. Never describe it as JFA-conformant.

Volunteer time is shared with JFA substrate work. Prefer the simplest option that passes each acceptance test.

## 2. Context Claude Code needs

**Organization.** NTARI is a Kentucky 501(c)(3). Its software is AGPL-3.0-or-later and its documents are CC BY-SA 4.0.

**Slack.** Governance runs in Slack, with one channel per federation: substrate, record, covenant, governance, and economy & information. `#desk-secretary` is set up to follow the NTARI-RAND GitHub org, so this repo's PRs should appear there. Write PR descriptions a non-developer can follow.

**Bylaws.** The bylaws live in `NTARI-RAND/bylaws`: P1-001 v1.0 (adopted), a v1.1 draft, and the draft venue policy P1-005. These are the provisions the bridge touches, as summarized for this plan; verify them in R5:

- §2.4: ballots and records identify parties by reference, never by personal information.
- §6.5: decisions pass by a majority of votes cast.
- §9.5: the governance registry.
- §12.5: a one-week rating period in the concerned federation channel.
- §14.2: members may inspect records.

Prosumer members place their vote in one federation, but their standing rights extend everywhere.

**JFA.** The spec lives in `NTARI-RAND/Janus`. Three parts are relevant:

- the privacy floor: shared records carry hashes, types, timestamps and references only;
- the Lines That Cannot Be Crossed;
- the Record layer, `NTARI-RAND/Tell`, released as Mycelium v0.1.0.

**Pol.is.** Upstream is `compdemocracy/polis`: AGPL-3.0, a Node/TypeScript API server, Postgres, a math worker, and docker compose. The supported integration path is xids on an embedded page. Its HTTP API is internal, not a published contract.

## 3. Target design

**Components, all on one host:**

1. Pol.is, self-hosted and pinned to a commit.
2. The bridge, in TypeScript. It has two parts:
   - a Slack app on Bolt for JavaScript in Socket Mode, so Slack needs no inbound endpoint;
   - a small web server for the join and embed pages.
3. A TLS reverse proxy.

**Flow:**

1. **Open.** A convener runs `/deliberate`. A modal asks for the Pol.is conversation ID, the federation, a close time and a link to the matter, such as a bylaws PR. The close time defaults to 7 days, mirroring §12.5's rating period. The bridge then posts an announcement with a "Take part" button in that federation's channel.
2. **Admit.** A member taps the button, and Slack's interaction payload identifies them. The bridge then:
   - checks eligibility;
   - derives the member's xid and admits it to Pol.is's whitelist;
   - mints a single-use token valid for 10 minutes;
   - replies with an ephemeral URL button.
3. **Vote.** The join page exchanges the token for a short session cookie and redirects to the embed page. The embed page renders the Pol.is embed with `data-xid`.
4. **Close.** The convener closes the round. The bridge then:
   - exports the report CSVs, builds a canonical bundle and hashes it;
   - posts the report link and the hash;
   - writes the registry record;
   - runs the audit.

**Identity:**

- **Deriving the xid.** `xid = hex(HMAC-SHA256(K_round, "ntari-polis-xid/v1|" + team_id + "|" + conversation_id + "|" + user_id))`, truncated to 32 hex characters. R1 confirms Pol.is's length limits. Because xids are per conversation, a member's votes can't be linked across rounds.
- **Round keys.** `K_round` is generated when a round opens. Gate 1 decides between two policies:
  - *Destroy at close (proposed default).* Record the admitted-xid set at close, then destroy the key. After that nobody, including host operators, can link a Slack user to votes. Keys must stay out of backups, or destroying them is meaningless. If a key is lost mid-round, the round closes early and is rerun.
  - *Retain.* A long-lived key held by the Secretary. This allows re-auditing by identity, but the key holder can de-anonymize votes.
- **What the bridge keeps.** It never stores or logs a Slack user ID alongside an xid, token or session. It also never logs admissions by Slack ID, since admission times could be matched against Pol.is participant creation times. It stores only token hashes, sessions (xid only), round configuration and the admitted-xid set.
- **What the audit proves.** Every xid with votes in the conversation was admitted, so nobody bypassed the eligibility check. It does not prove the check itself was correct; that rests on the code being public.

**Same-site layout.** Serve Pol.is and the bridge under one registrable domain, such as `polis.<domain>` and `vote.<domain>`. That way Pol.is's cookies inside the iframe count as first-party. Safari and iOS in-app browsers (WebKit) block third-party cookies by default.

## 4. Working rules

Appendix A becomes `CLAUDE.md` and holds the full rules. In short:

- Use plan mode before each phase, and before touching keys, tokens, sessions, storage or logging.
- Stop at gates.
- A task is done only when its tests pass.
- Research cites sources with commit SHAs.
- Make no upstream Pol.is changes without a recorded decision.
- A human merges every PR.

## 5. Phases

### Phase 0: Bootstrap (Claude Code)

- Create `CLAUDE.md` (Appendix A), `.claude/settings.json` (Appendix B) and `docs/STATUS.md` (Appendix C).
- Create the folders `docs/research/` and `docs/decisions/`.
- Create `LICENSE` with the full AGPL-3.0 text, and state "or later" in the README and the SPDX headers.
- Create `.gitignore` covering `.env`, `.env.*` and `secrets/`.
- Create `env.example` and a stub `README.md`.
- Write `docs/decisions/000-repo-and-stack.md` proposing:
  - the repo location and name;
  - TypeScript on Node LTS;
  - Bolt for JavaScript in Socket Mode;
  - Express for the web pages;
  - SQLite via better-sqlite3;
  - Vitest and Playwright for tests.

**Gate 0:** a human approves the repo, license and stack.

### Phase 1: Research spikes (Claude Code)

Each spike writes `docs/research/R<n>-<slug>.md` with five parts: the question, the method, findings marked verified or inferred, sources (URLs, file paths, commit SHAs) and a recommendation.

Ordering:

- R4–R6 can run as parallel subagents alongside R1.
- R2 and R3 need R1's running stack.
- R1 is go/no-go for the whole design.

**R1: Pol.is baseline and xid embedding**

- Clone upstream. Identify the default branch and the state of both participation clients, the legacy one and the rewrite. There are two known reports:
  - A reviewer of PR #2304, the participation-client rewrite, found `xid`, `ucsh`, `ucst` and `ui_lang` broken in the new embed.
  - Discussion #2441 reports xid failing on first load when it's passed in a direct link.
- Run the stack with docker compose and create a conversation with seed statements.
- Embed it via `embed.js` on a local page with `data-xid`, and vote in Chromium, Firefox and WebKit using Playwright.
- Confirm three things:
  - votes land under the xid's participant;
  - the per-user flags `ucv` and `ucw` work;
  - which length and characters an xid may use.
- **Done when:** there's a pinned commit SHA and client choice where xid embedding works in all three engines, with a reproducible test.

**R2: Pol.is gating**

- Find how to enable two features:
  - the domain whitelist, which is unofficial and off by default;
  - the xid whitelist. See commit `5db8596` ("add bin scripts for managing whitelists"), branch `br/add-xid-whitelist` and #1785.
- Find what the domain check inspects, such as the referrer or a parameter. That answer constrains the embed page's `Referrer-Policy`.
- Test three behaviors:
  - the conversation refuses to load off the approved domain;
  - a non-admitted xid can't vote;
  - admitting an xid at runtime takes effect immediately.
- If admission needs direct database writes, use a database role limited to that table. If runtime admission is impossible, design a sync.
- **Done when:** the enable procedures are documented and tested.

**R3: Pol.is data, export and personal data**

- List the report export files, such as `/api/v3/reportExport/<report_id>/participant-votes.csv`.
- Find the tables that join an xid to its participant and to its votes, and write the audit SQL.
- List the personal data Pol.is stores by default: emails, IP addresses, user agents and social logins. Find how to disable or purge each; upstream ships a purge-PII script.
- Confirm that participant email and social login can be turned off.
- **Done when:** the audit query and a data-minimizing configuration are documented.

**R4: Slack platform**

Confirm each of these:

- Bolt for JavaScript in Socket Mode works for an internal app.
- The minimal scopes. Expect `commands`, `chat:write` and `usergroups:read`, possibly with `channels:read` and `groups:read`.
- The app-level token that Socket Mode needs.
- Ephemeral messages can carry URL buttons.
- Modals work as needed for the open and close commands.
- Whether user groups need a paid plan, and what NTARI's current plan is.
- How URL buttons open on iOS and Android.

Then draft `slack/manifest.yml`.

- **Done when:** the manifest draft and the scope rationale exist.

**R5: NTARI constraints**

- Read these sources:
  - the Janus README and the spec sections on the privacy floor and the Lines That Cannot Be Crossed;
  - P1-001 v1.0, the v1.1 draft and the P1-005 draft, for the provisions in §2 and any venue rules;
  - `NTARI-RAND/Tell`, for a way to append a record by CLI or API.
- Produce a checklist mapping each relevant provision or line either to a design requirement or to "not applicable."
- Propose a format for the registry record.
- **Done when:** the checklist is complete and any conflict with §3 is raised as a decision.

**R6: Hosting**

- Compare two options:
  - (a) NTARIHQ, NTARI's Ubuntu Server homelab, reached through an outbound-only tunnel to a public relay. One example is WireGuard to a small VPS running the TLS proxy. This matches the JFA substrate's no-inbound-ports design.
  - (b) A small VPS running everything.
- Weigh uptime during voting windows, power and ISP risk, backup and restore, data custody, cost, operating burden and the same-site domain layout.
- **Done when:** there's a recommendation with its tradeoffs.

**Gate 1 (founder board) decides:**

- the Pol.is commit and client;
- the host;
- eligibility scope: the federation's roll only, or all members, since standing extends everywhere and only the vote is placed;
- the roll source: a Slack user group per federation, channel membership, or a roll file;
- the key policy: destroy per round, or retain;
- the registry destination: Tell, or a JSON-lines file in a registry repo via PR;
- the domain names;
- who may convene rounds.

### Phase 2: Infrastructure as code (Claude Code)

- Write `deploy/compose.yml` with Pol.is at the pinned SHA, the bridge and the chosen proxy, in dev and prod profiles.
- Configure Pol.is per R2 and R3:
  - domain lock on;
  - xid whitelist on;
  - participant email and social login off;
  - personal data minimized.
- Set up a nightly Postgres dump and SQLite backup with retention. Round keys stay out of the backups.
- Document a restore drill.
- **Done when:** `docker compose --profile dev up` starts the stack locally, health checks pass and the restore drill succeeds.

**Gate 2 (maintainer and workspace admin), before any non-local deploy:**

- provision the host and DNS;
- create the Slack app from the manifest in a test workspace;
- place secrets on the host, never in the repo.

### Phase 3: Bridge MVP (Claude Code, test-first)

**1. Scaffold**

- strict TypeScript, ESLint, Prettier, Vitest and Playwright;
- SPDX headers on every source file;
- CI that lints, tests, builds and scans for secrets (for example with the gitleaks CLI).

**2. Core**

- xid derivation, with known-answer tests;
- round keys: generation, storage outside backups, and destruction;
- tokens: stored only as SHA-256 hashes, single use, 10-minute expiry;
- sessions, the round store and the admitted-xid set;
- a daily purge of expired tokens and sessions.

**3. Slack app**

- `/deliberate open` and `/deliberate close`, for conveners only.
- The announcement post.
- The "Take part" handler, in this order: eligibility check, xid, whitelist admission, token, ephemeral URL button.
- Plain error messages for a closed round, an ineligible member, or Pol.is being unavailable.
- Bolt's logger set to `warn` in production. Payloads are never logged.

**4. Web**

- `/join?t=…` exchanges the token, sets the cookie and redirects with a 303, so the token leaves the address bar.
- `/round/:id` renders the embed with `data-xid`. It needs:
  - a Content Security Policy limiting scripts and frames to the Pol.is origin;
  - the `Referrer-Policy` that R2 requires;
  - a footer link to this repo's source.
- Request logs never include query strings.

**5. Close-out**

- The convener supplies the report ID, unless R3 finds a way to create the report automatically.
- Export the results and build a canonical bundle: sorted filenames, LF line endings and a manifest of per-file SHA-256 hashes. Then hash the bundle.
- Post a Slack summary with the participant count, statement count, report link and hash.
- Write the registry record.
- Destroy the round key if the Gate 1 policy says so.

**6. Audit CLI**

- Check that the participants are a subset of the admitted set.
- Print counts and pass/fail. Print no xids by default.

**Done when:** a Playwright end-to-end run passes locally. It covers a simulated join payload, the token, the embed, votes, close, the bundle hash and a passing audit. Negative tests must also pass for:

- an expired token;
- a reused token;
- an ineligible member;
- a non-admitted xid;
- an embed on another domain;
- a closed round.

### Phase 4: Privacy and security review (Claude Code, then a human)

- Write `docs/threat-model.md`. It covers:
  - **Assets:** votes, round keys, tokens and the admitted set.
  - **Adversaries:** a curious operator, a forwarded link, an outsider, a compromised host, and timing correlation with Slack-side data.
  - **Mitigations.**
  - **Residual risks, stated plainly.** For example, a host operator can link identities while a round is open.
- Verify four things:
  - logs from an end-to-end run contain no Slack IDs or tokens;
  - a dependency audit comes back clean;
  - git history contains no secrets;
  - neither database holds Slack IDs.
- Run a fresh-context subagent review against the R5 checklist, then a human review.

**Gate 3 (the Secretary and one other reviewer):** sign-off, with no open high-severity findings.

### Phase 5: Staging (human-led, Claude Code supports)

- Deploy to the chosen host against the test Slack workspace.
- Three to five testers complete a round end to end, using the Slack app on iPhone, on Android and on desktop.
- **Done when:** all testers finish, fixes are merged and the runbook is drafted.

### Phase 6: Pilot (human-led)

- A workspace admin installs the app in NTARI's Slack.
- Run one low-stakes round in one federation channel.
- Claude Code fixes issues and writes `docs/pilot-report.md`.

**Gate 4 (board), before a round feeds a binding vote:**

- Adopt the P1-005 amendment. It names Pol.is as an official deliberation venue and defines how results are recorded.
- Get Kentucky counsel's confirmation.

The first candidate matter is adopting P1-001 v1.1.

### Phase 7: Handover (Claude Code)

- `README.md`: what the bridge is, and its privacy model in plain language.
- `docs/runbook.md`, covering:
  - opening and closing rounds;
  - adding conveners;
  - moderating statements in Pol.is;
  - handling keys;
  - restoring from backup;
  - upgrading Pol.is. Re-run the R1 suite against the new SHA before bumping it.
- `CONTRIBUTING.md`.
- `docs/backlog.md` for everything deferred.

## 6. Gates

| Gate | After | Decides | Who |
|---|---|---|---|
| 0 | Phase 0 | repo, license, stack | maintainer |
| 1 | Phase 1 | Pol.is SHA and client, host, eligibility scope, roll source, key policy, registry destination, domains, conveners | founder board |
| 2 | Phase 2 | host, DNS, test Slack app, secrets | maintainer and workspace admin |
| 3 | Phase 4 | privacy and security sign-off | Secretary and one other reviewer |
| 4 | Phase 6 | P1-005 amendment, counsel check | board |

## 7. Not in the MVP

These items go to `docs/backlog.md`:

- **Translations under P2-002.** `ui_lang` was also reported broken in the new client.
- **Reminders to individuals.** These would require linking Slack IDs to participation.
- **Creating Pol.is conversations from Slack.**
- **Splitting results by federation.** This may be possible later via xid-linked metadata.
- **Multi-workspace support.**
- **LBTAS ratings or federation-weighted votes.** These belong to the JFA Governance layer.

## 8. References

**Pol.is**
- Embed code and xid: https://compdemocracy.org/embed-code and https://compdemocracy.org/Identity
- Source and threads: https://github.com/compdemocracy/polis (discussions #1320, #1377 and #2441; PR #2304; commit 5db8596)

**Claude Code**
- Memory, settings and permissions: https://code.claude.com/docs

**NTARI**
- https://github.com/NTARI-RAND/Janus
- https://github.com/NTARI-RAND/bylaws
- https://github.com/NTARI-RAND/Tell

---

## Appendix A: `CLAUDE.md`

```markdown
# polis-bridge

Connects NTARI's Slack to a self-hosted Pol.is. Slack identifies members, Pol.is hosts the deliberation, and votes carry a pseudonymous per-round xid. The plan is PLAN.md; read the current phase's section before working.

Progress: @docs/STATUS.md

## Session routine
- Start: read docs/STATUS.md. Continue the current phase only.
- Use plan mode before starting a phase. Also use it before touching xid derivation, keys, tokens, sessions, storage or logging.
- End: update docs/STATUS.md with what's done, what's next, open questions and blockers.
- At a gate: write docs/decisions/NNN-<slug>.md with the options and a recommendation, then stop and wait.

## Privacy floor (never break)
- Never store or log a Slack user ID together with an xid, token or session.
- Never log admissions by Slack ID.
- Never log tokens or any URL with a query string.
- Real secrets live only on the host. Never read or print .env or anything in secrets/. Developers fill .env from env.example with throwaway test-workspace credentials.
- Pol.is receives the xid and nothing else about a person.
- Registry records carry hashes, types, timestamps and references only.
- Round keys never enter backups.

## Upstream and licensing
- Don't modify upstream Pol.is. If a patch is unavoidable, record a decision, keep the patch in patches/, and publish the patched source (AGPL network clause).
- Pin everything: the Pol.is commit SHA, the lockfile and container image digests.
- Put SPDX-License-Identifier: AGPL-3.0-or-later on every source file.

## Engineering
- Strict TypeScript on Node LTS.
- Write tests first for core logic. A phase isn't done until its acceptance tests pass.
- Make small commits, with one branch and one PR per task. A human merges.
- PRs appear in #desk-secretary, so write descriptions a non-developer can follow.
- Research notes cite sources (URL, file path, commit SHA) and separate verified findings from inferred ones. When docs and code disagree, trust the code and say so.
- Prefer the simplest option that passes the acceptance tests.

## Scope
- MVP only (PLAN.md §1). Everything else goes to docs/backlog.md.
- This is interim tooling under draft policy P1-005. Never describe it as a JFA implementation or as JFA-conformant.

## Commands
(fill in during Phase 3, step 1)
```

## Appendix B: `.claude/settings.json`

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)"
    ]
  }
}
```

These deny rules govern Claude Code's file tools. The docs say they don't necessarily stop shell commands, so real secrets never sit in the working tree. Developers fill `.env` from `env.example` with throwaway test-workspace credentials only.

## Appendix C: `docs/STATUS.md`

```markdown
# Status

Current phase: 0 (Bootstrap)
Last updated: YYYY-MM-DD

## Done

## Next

## Open questions

## Waiting on
(gate number and decision file, if any)
```
