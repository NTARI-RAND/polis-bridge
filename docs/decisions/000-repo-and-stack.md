# 000: Repository, license and stack

- **Status:** approved 2026-10-11 (Gate 0 closed)
- **Decides:** maintainer
- **Date:** 2026-10-11
- **Plan reference:** PLAN.md §5, Phase 0

## Context

Phase 0 sets up the repository. Before any research or code, a maintainer approves where the repo lives, its license and the stack. The rest of the plan assumes these choices, so changing them later means rework.

The guiding rule (PLAN.md §1): volunteer time is shared with JFA substrate work, so prefer the simplest option that passes each acceptance test.

## Proposals

### 1. Repository: `NTARI-RAND/polis-bridge`, public

- **Proposed:** a public repository named `polis-bridge` in the `NTARI-RAND` GitHub organization, default branch `main`.
- **Why public:** the audit only proves that every voter went through the eligibility check. Whether the check itself is correct rests on the code being public (PLAN.md §3). The AGPL network clause also requires offering the source to users.
- **Why NTARI-RAND:** it holds NTARI's other software, and `#desk-secretary` already follows the org, so PRs show up there without extra setup.
- **Org settings to turn on at creation:** secret scanning with push protection, Dependabot alerts, and the org's branch ruleset (human-merged PRs only), matching NTARI's other public repos.
- **Current state:** the repo has **not** been created on GitHub. A local repo exists with `PLAN.md` on `main` and the Phase 0 files on branch `phase-0-bootstrap`. After approval, a maintainer creates the empty GitHub repo; then the local history is pushed and the Phase 0 branch opened as a PR.
- **Alternative:** a personal or private repo. Rejected, because it would hide the code that the audit's trust depends on.

### 2. License: AGPL-3.0-or-later

- NTARI policy: software is AGPL-3.0-or-later and documents are CC BY-SA 4.0 (PLAN.md §2).
- Upstream Pol.is is AGPL-3.0, so the combined deployment must honor the network clause either way.
- `LICENSE` holds the unmodified AGPL-3.0 text (661 lines; byte-identical to the copies in NTARI's Cloudy and sohocloud-protocol repos). "Or later" is stated in the README, and every source file will carry `SPDX-License-Identifier: AGPL-3.0-or-later`.
- **Open point for the maintainer:** the docs in this repo (PLAN.md, research notes, decisions) are part of a software repo. The proposal is to keep them under the repo's AGPL license for simplicity, rather than splitting off CC BY-SA 4.0. Say so at Gate 0 if docs here should be CC BY-SA 4.0 instead.

### 3. Language and runtime: TypeScript (strict) on Node.js 24 LTS

- Upstream Pol.is's server is Node/TypeScript, so one language covers reading upstream code and writing the bridge.
- Node 24 is the current Active LTS line. Node 26 is due to enter LTS in late October 2026; the proposal is to start on 24 and move to 26 once it's LTS and our dependencies support it. The version will be pinned in `.nvmrc` and `package.json` `engines`.

### 4. Slack: Bolt for JavaScript in Socket Mode

- Bolt is Slack's official framework. It handles slash commands, modals, buttons and ephemeral replies, which is everything the MVP needs.
- Socket Mode means the bridge opens an outbound connection to Slack, so Slack needs no inbound endpoint. That suits an outbound-only host such as NTARIHQ behind a tunnel (R6).
- Socket Mode apps can't be listed in the Slack Marketplace. That's fine: this is an internal app for one workspace.
- R4 confirms scopes, the app-level token and mobile behavior.

### 5. Web pages: Express

- Two small pages (`/join` and `/round/:id`) plus a health check. Express is the most widely known option for volunteers. It sets headers easily (CSP, Referrer-Policy, cookies) and Bolt already depends on it, so it adds little.
- **Alternative:** Bolt's own HTTP receiver, or Fastify. Rejected for now: the receiver isn't meant for app pages, and Fastify adds a second framework for no MVP benefit.

### 6. Storage: SQLite via better-sqlite3

- The bridge stores very little: round configuration, token hashes, sessions (xid only) and the admitted-xid set. One file on one host is enough.
- better-sqlite3 is synchronous and simple, and backup is a file copy (the SQLite online backup API). No extra database server is needed beyond the Postgres that Pol.is already runs.
- Round keys are **not** stored in SQLite. They go in a separate key directory that is excluded from backups (`BRIDGE_KEY_DIR` in `env.example`), so destroying a key at close actually works.
- **Alternative:** a schema in Pol.is's Postgres. Rejected: it couples our data to upstream's database and backup cycle, and makes "round keys never enter backups" harder to guarantee.
- **Note:** better-sqlite3 is a native module. It needs prebuilt binaries for the Node version, or a build toolchain in the container image. That's another reason to pin the Node version.

### 7. Tests: Vitest and Playwright

- **Vitest** for unit tests: xid derivation known-answer tests, tokens, sessions and the bundle hash. It runs TypeScript natively and is fast.
- **Playwright** for end-to-end and cross-browser tests. R1 needs Chromium, Firefox and WebKit, and WebKit matters most because Safari blocks third-party cookies. The same suite becomes the regression check before every Pol.is upgrade (PLAN.md Phase 7).

## Recommendation

Approve all seven as proposed, and answer the docs-license point under item 2.

## Decision

2026-10-11, Jodson Graves (maintainer):

- **Item 1, repository:** approved. "Create the repo."
- **Item 2, license:** approved as AGPL-3.0-or-later, including the docs in this repo (no CC BY-SA split).
- **Item 3, language and runtime:** approved as TypeScript on Node.js 24 LTS. Moving to 26 later is a routine upgrade.
- **Items 4–7 (Bolt in Socket Mode, Express, SQLite via better-sqlite3, Vitest and Playwright):** approved. The maintainer asked whether Wix (which hosts ntari.org) could replace Express. Answer: no. Express is a library inside the bridge on our own host, and serving the join and embed pages from Wix would put a third party in the identity path, prevent the required security headers, and break the same-site layout. Wix's role is DNS records for the bridge's subdomains (if ntari.org's DNS is managed there) and linking from the main site, at Gate 2.

**Gate 0 closed.**
