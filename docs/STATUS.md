# Status

Current phase: 0 (Bootstrap), complete; Gate 0 approved 2026-10-11
Last updated: 2026-10-11

## Done
- Local git repo created at `Documents/polis-bridge`, with `PLAN.md` committed on `main` (the plan's "How to start" step 1, done locally).
- Phase 0 files on branch `phase-0-bootstrap`:
  - `CLAUDE.md` (Appendix A), `.claude/settings.json` (Appendix B), this file (Appendix C);
  - `docs/research/` and `docs/decisions/`;
  - `LICENSE`: full AGPL-3.0 text; "or later" stated in `README.md` and in the SPDX headers;
  - `.gitignore` (covers `.env`, `.env.*`, `secrets/`, plus local data and keys) and `.gitattributes` (LF everywhere);
  - `env.example` and a stub `README.md`;
  - `docs/decisions/000-repo-and-stack.md`.

## Next
- Repo created 2026-10-11 (public). A human merges PR #1 (Phase 0).
- Then Phase 1: R1 (Pol.is baseline and xid embedding), with R4–R6 running in parallel.

## Open questions
- Resolved 2026-10-11: repo approved and created; docs stay AGPL-3.0-or-later.
- Resolved 2026-10-11: Node.js 24 LTS.
- Resolved 2026-10-11: stack items 4–7 approved; Wix not used for the bridge's pages (see decision 000).

## Waiting on
- A human merges PR #1. Then Phase 1 starts (plan mode first, per CLAUDE.md).
