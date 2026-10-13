<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# R3 spike: Pol.is data, exports and personal data

Research code for PLAN.md spike R3. Not production code. Findings:
`docs/research/R3-polis-data.md`. Uses the stack and fixtures from
`research/r2` (run `research/r2` first, or at least `node research/r2/tools/setup.mjs`
with the R2 host server running) and the helpers in `research/r2/lib/r2.mjs`.

| File | What it does |
|---|---|
| `tools/exports-probe.mjs` | In round "P": admits 3 test xids, votes, creates a report through the API, fetches every export with and without a login, checks who can learn the conversation UUID, tries an email subscription with `subscribe_type=0`, counts `participants_extended` fields. Prints statuses and header rows only. Saves the admitted set to `.local/admitted-P.txt`. |
| `tools/xid-exposure-check.mjs` | Chain check: a participant token reads the conversation UUID, the public xid CSV lists other members' xids, and a vote sent with another member's xid (no token) is accepted. Counts only; changes one test vote in round P. |
| `sql/audit.sql` | Close-of-round audit: every participant who voted or wrote is an admitted xid. Counts and PASS/FAIL, no xids. |
| `tools/run-audit.mjs` | Runs `audit.sql`: `node tools/run-audit.mjs <round> <admitted-file \| --from-allowlist>`. The admitted set goes to psql on stdin. |
| `sql/pii-inventory.sql` | Row counts for every personal-data column (counts only). |
| `sql/roles.sql` | Proposed narrow Postgres roles: `bridge_admit` (insert allow-list rows only) and `bridge_audit` (read-only, audit columns only). |

```sh
node research/r3/tools/exports-probe.mjs
node research/r3/tools/run-audit.mjs P --from-allowlist
node research/r3/tools/run-audit.mjs P research/r3/.local/admitted-P.txt
docker exec -i polis-r1-postgres-1 psql -U postgres -d polis-dev -X -q < research/r3/sql/pii-inventory.sql
```

`.local/` (gitignored) holds the probe output, admitted sets and audit runs.

**At Pol.is `stable` d3d38cec and later** (upstream fix compdemocracy/polis#3048):
`xid-exposure-check.mjs` stops with a `TypeError` after step 2. That is the
expected, fixed result: `GET /api/v3/conversationUuid` now refuses a participant
token (403), so there is no UUID to fetch the CSV with. The 2026-10-13 retest
checked each link of the chain on its own with a local helper (gitignored, not
in the repo); results are in `docs/research/R3-polis-data.md`, addendum. The
other commands are unchanged.
