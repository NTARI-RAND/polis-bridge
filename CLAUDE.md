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
