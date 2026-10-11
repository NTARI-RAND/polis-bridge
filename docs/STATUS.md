# Status

Current phase: 0 (Bootstrap), complete and waiting at Gate 0
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
- After Gate 0: a maintainer creates `NTARI-RAND/polis-bridge` on GitHub (empty, public). Then push `main`, and open `phase-0-bootstrap` as a PR for a human to merge.
- Then Phase 1: R1 (Pol.is baseline and xid embedding), with R4–R6 running in parallel.

## Open questions
- Resolved 2026-10-11: repo approved and created; docs stay AGPL-3.0-or-later.
- Node 24 LTS now, or wait for Node 26 to enter LTS later in October 2026 (decision 000, item 3)?

## Waiting on
- Gate 0: `docs/decisions/000-repo-and-stack.md` (maintainer approves repo, license, stack).
