<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# R5: NTARI constraints on the bridge

Research spike R5 from PLAN.md, Phase 1. Written 2026-10-12.

## 1. Question

Which provisions of NTARI's own instruments bind the Polis–Slack bridge, and how? Specifically:

1. Do the bylaws say what PLAN.md §2 says they say (§2.4, §6.5, §9.5, §12.5, §14.2)? What else in them touches venues, deliberation, federations, where prosumers vote, records and privacy?
2. What do the Janus Facing Architecture (JFA) privacy floor and "Lines That Cannot Be Crossed" require of governance tooling like this bridge?
3. Can the bridge append a record to Tell (the Record layer, "Mycelium v0.1.0") by command line (CLI) or application programming interface (API)? What shape is a record?
4. What should the bridge's registry record look like, and where does anything here conflict with PLAN.md §3?

Terms used below:

- **xid**: the pseudonymous ID the bridge hands Pol.is for one member in one round. It is derived with **HMAC**, a keyed hash: the same inputs and key always give the same output, but nobody can reverse it or recompute it without the key.
- **Hash**: a short fingerprint of a file (here SHA-256). Any change to the file changes the fingerprint.
- **Append-only**: records can be added and annotated but never edited or deleted.
- **Invariant**: a rule in the JFA conformance suite's registry, with a stable ID such as `L7`. An invariant **bound to "instrument"** can only be checked by a governance document and its venue tooling, not by the suite itself.
- **Mode**: the most common value in a set of ratings.
- **JSONL**: JSON Lines, a text file with one JSON record per line.
- **Prosumer**: in JFA, any member of an economy, since everyone both produces and consumes.

## 2. Method

1. Read PLAN.md §1–§3 and the R5 section, and the repo's CLAUDE.md, at polis-bridge `697fa51`.
2. Cloned `NTARI-RAND/bylaws`, `NTARI-RAND/Janus` and `NTARI-RAND/Tell` into a scratch directory outside this repo, and listed every open and closed PR with `gh`.
3. Read in full: bylaws P1-001 v1.0, the v1.1 draft and the P1-005 draft; the Janus README and official document; Tell's README on `main` and the spec and reference code on its open PR #1.
4. Ran the JFA conformance suite (`python -I jfa-conformance-suite.py --list`) to get the live invariant registry and each invariant's binding.
5. Searched the Janus companion documents (open questions, dispute mechanics, structure article, concept triage) for venue, deliberation, ballot, synthesis and Pol.is.
6. Compared the local document store (`C:\Users\Jodson Graves\Documents\NTARI Official Docs\Bylaws\` and `...\JFA\`) with the GitHub copies, using `diff` with line endings normalized.
7. Mapped each relevant provision to a bridge requirement or to "N/A".

Changed nothing in any repository, and commented on no PR or issue.

## 3. Findings

### 3.1 Where the sources stand (Verified)

- **Bylaws, all on `main`.** PR #4 ("Consistency pass, September 2026: P1-001 v1.1 draft and P1-005 venue policy") was **merged 2026-10-08** as `3276781`. The repo has **no open PRs**. Merging put the drafts on `main`; it did not adopt them. Both files still say "draft, pending adoption".
  - P1-001 v1.0 (adopted 2026-08-31): `P1-001_Bylaws_v1.0.md`, last changed in `4246602`.
  - P1-001 v1.1 draft: `P1-001_Bylaws_v1.1.md`, at `3276781`.
  - P1-005 v1.0 draft: `P1-005_Governance-Venue-Policy_v1.0.md`, at `3276781`. It has three clauses: Slack is the venue in force, it is a proprietary interim, and the committed exit is the JFA governance platform once the other four layers are built. **It does not mention Pol.is or any deliberation tool.**
- **Janus `main` is at `3202519`**, and the official document was last changed in `d24e404` (PR #18). PRs #15 and #16, which the task named, were **merged on 2026-10-08**. The only open PR is #20, a translation refresh with no substantive change.
  - The suite reports 30 registered invariants: 3 bound to the document, 27 delegated. All executed checks pass.
  - The README still says "26" invariants and "dispute-mechanics design … not in this repository yet". Both are stale, since `jfa-dispute-mechanics.md` is now in the repo.
- **Tell has no released record API.**
  - The `v0.1.0` release ("Mycelium v0.1.0", 2026-10-01) points at `64ff489`, the "Initial commit". That commit holds only `README.md` and `LICENSE`.
  - The spec (`SPEC.md`, P3-013 v0.3) and the reference implementation (`mycelium.js`, package version 0.3.0) exist only on **open PR #1**, head `68d726e`. That PR has been unreviewed since 2026-07-01.
  - PR #2, which renames Mycelium to Tell, is also open.
- **The local store is behind GitHub, not ahead.**
  - `Bylaws\` has no `P1-001_Bylaws_v1.1.md`. It has only `P1-001_Bylaws_v1.1-draft.md` dated 2026-09-22, which differs from GitHub's v1.1 on 231 lines.
  - No P1-005 file exists anywhere under `Bylaws\` or `JFA\`.
  - The local `P1-001_Bylaws_v1.0.md`, modified 2026-09-30, **differs from the adopted GitHub v1.0** in the wording of §6.7 and §12.5. That is an edit to an adopted instrument outside the record, so this note treats GitHub as authoritative.
  - `JFA\janus-facing-architecture.md` (2026-09-17) lacks the PR #15/#16/#18 text, for example the witness draw and "held by six parties".
  - None of these differences changes a requirement below.

### 3.2 PLAN.md §2 claims, checked (Verified, bylaws `3276781`)

| PLAN.md claim | v1.0 | v1.1 draft | Verdict |
|---|---|---|---|
| §2.4: parties identified by reference, never personal info | §2.4, same text | §2.4, unchanged | **Correct.** One nuance: the text adds "beyond what the proceeding itself requires". |
| §6.5: majority of votes cast | §6.5. Delegates' ballot valid when ≥3 federations cast. Inside a federation, majority of votes cast, valid if notice was given and ≥1 member casts; in Governance, ≥1 *operating* member must be among them. The record states the roll. | §6.5. The operating-member rule is dropped. **New:** where prosumers vote, a matter also needs a majority of *platforms*, and the roll is recorded *by platform*. | **Correct but incomplete.** It applies to binding ballots, which the bridge does not run. |
| §9.5: the governance registry | §9.5. The Secretary keeps a public, append-only registry of: recognitions and lapses; Article XI publications; expulsions, readmissions and re-entries; amendments. It honors §2.4. | §9.5. Adds prosumer federation elections under §3.9. | **Correct, with a gap.** The list does not include deliberation rounds (see Decision D1). |
| §12.5: one-week rating period in the federation channel | §12.5(b). The Vice President dockets an **appeal or readmission petition** for one week of **covenant (LBTAS) ratings**. | §12.5(b). The President's office dockets it, and an expulsion appeal is decided within seven days. | **Wrong basis for the 7-day default.** §12.5 is the petition procedure. The general rule is §6.4: notice at least one week before a vote closes, and a default voting window of one week (see D2). |
| §14.2: members may inspect records | §14.2, on reasonable notice | §14.2, unchanged | **Correct.** |
| Prosumers place their vote in one federation | §3.4, §3.8. Prosumers belong to the **Governance federation only**. | §3.4, §3.9. A prosumer **elects Covenant or Governance**, can change once a year at the March equinox, and keeps standing everywhere (§3.9, §4.1(d)). | **Matches v1.1, not the adopted v1.0** (see D3). |

### 3.3 Requirements checklist

"Where in design" names the PLAN.md section, or the bridge component, where the requirement lands. Section numbers are the same in v1.0 and v1.1 unless the row says otherwise. Each row is **Verified** against the cited text unless marked *(Inferred)*.

| Source | Provision | What it says | Bridge requirement or N/A | Where in design |
|---|---|---|---|---|
| Bylaws v1.0/v1.1 | §2.4 privacy floor | Shared record: hashes, types, timestamps and references only. Ballots and filings name parties by reference. | Registry records and Slack summaries carry no Slack ID, name, email or statement text. Pol.is gets the xid only. | §3 Identity; registry record (§5) |
| Bylaws | §2.5 append-only | Governance records are corrected by annotation, never deleted or rewritten. | A written registry record is never edited. A correction or rerun is a new record that `annotates` the old one. Deleting tokens and sessions, and destroying keys, is fine: they are not governance records. | Phase 3 step 5; registry |
| Bylaws | §3.4 one member, one vote per federation | One vote per member in each federation, however many instances it runs. | The roll maps each **member** to exactly one Slack user. An organization member with several staff accounts must not get several participants. *(Inferred.)* | Gate 1 roll source |
| Bylaws v1.0 §3.8 / v1.1 §3.8–3.9 | Prosumer placement | v1.0: Governance only. v1.1: Covenant or Governance by election, changeable yearly. | Per-federation rolls follow whichever version is in force. Rolls change at the equinox under v1.1. | Gate 1 eligibility and roll |
| Bylaws | §4.1(d), §4.3 standing | Non-member prosumers may address the channel in any proceeding that concerns them, and their filings are received on equal terms. | Input for the Gate 1 "eligibility scope" choice. Voice in deliberation is standing, not the vote. | Gate 1 |
| Bylaws | §4.5 bloc visibility | Prosumer-member votes are published as cast, so a voting bloc is visible. | The bridge hides identity by design, so a Pol.is round can **never be the binding ballot**. That is consistent with PLAN §1. | §1 limits; Gate 4 |
| Bylaws v1.1 | §6.5 platform majority | Where prosumers vote, a matter needs a majority of platforms too, and the roll is recorded by platform. | N/A to the MVP, because it is non-binding. It is the reason a Pol.is result cannot substitute for a ballot. Splitting results by platform is in the backlog. | §7 backlog |
| Bylaws | §5.2 appropriate channel | A matter goes to the channel of its layer; a cross-layer matter goes to Governance. | The open modal says this, and the announcement goes to the chosen federation's channel. | `/deliberate open` modal |
| Bylaws | §5.6 venues | Venues must be leaveable, and the governance record exportable whole. A proprietary venue is allowed only as a named interim. | Round records and bundles are exportable as plain files (JSONL plus CSV). Pol.is data is recoverable from its own database dump. No decision may *depend* on the bridge running. | Phase 2 backups; registry |
| P1-005 draft | §1–§3 | Slack is the venue in force, as an interim, with exit to the JFA governance platform. | Pol.is is not named, so it cannot be an official venue until the Gate 4 amendment. Keep the Slack-specific code in one module, since the committed exit retires Slack. *(Inferred.)* | Gate 4; Phase 3 layout |
| Bylaws | §6.3 no delegated vote | Members cast their own votes and may not assign them. | Tokens are single-use, last 10 minutes, and become a session cookie. A forwarded *unused* link is the residual risk; the threat model must state it. | Phase 3 tokens; Phase 4 |
| Bylaws | §6.4 notice and window | Notice goes to the appropriate channel at least one week before a vote closes. The default window is one week. | The 7-day default close is justified by §6.4, not §12.5. Warn the convener when a round closes in under 7 days. | `/deliberate open` |
| Bylaws | §6.6 open proceedings | Ballots and assemblies are open to prosumers and the public, within §2.4. | The Pol.is report link should be readable without a Slack login, and the registry is public. *(R3 to confirm Pol.is report visibility.)* | Close-out; R3 |
| Bylaws v1.0 §6.7 / v1.1 §6.7 | Reopening | Any member may reopen a decided matter. v1.1: a newly documented harm overrides the 90-day bar. | Every round summary states that the result informs a decision and that any member may reopen it. | Close-out summary text |
| Bylaws | §6.9 deliberation procedure | The deliberation procedure is set by policy at the venue. A single documented harm reopens a synthesis, and harm is never averaged in. | **The most important requirement.** The bridge must never post a "consensus" or a single summary score as the outcome. It posts counts, the report link and the hash. **No deliberation-procedure policy exists yet** (see D4). | Close-out; Gate 4 |
| Bylaws v1.1 | §7.3 vacant office | A federation with a vacant office does no other business, "and the governance software enforces this." | If v1.1 is adopted, the bridge refuses to open a round in a federation flagged vacant (see D6). | Round store config |
| Bylaws v1.1 | §8.3, §8.6, §12.1 | The Vice President oversees the Governance frontend. The Workspace Administrator provides governance-platform services. The responsibility is shared. | Names the offices that own the bridge's operation, and who installs it and adds conveners. | Gate 1 conveners; runbook |
| Bylaws | §7.6 no gate not named | The Board may not insert itself as an approval step. | Restricting who may convene must not become a Board gate on members raising matters (§6.3) (see D5). | Gate 1 conveners |
| Bylaws | §9.5 registry | The Secretary maintains the registry. | The bridge proposes records. The Secretary's office, or a human merging a PR, commits them. The bridge never writes to the registry alone. *(Inferred from "the Secretary maintains".)* | Gate 1 registry destination |
| Bylaws | §9.10(f) identifiers | Identifiers are platform-scoped key hashes. Human-chosen identifiers are refused. | The xid is HMAC-derived and never chosen by the member. Pol.is name, email and social login stay off. (The clause is about covenant reputation; it is used here as a guide.) | §3 Identity; R3 |
| Bylaws | §9.6, §9.14(c), §9.15 | A conformance claim counts only where tests cite invariant IDs. Instrument-bound invariants bind "a governance instrument and its venue tooling". | Implement the requirements behind L6 and L7 below. Whether the bridge's tests *cite* those IDs is a decision, because citing them is how a conformance claim is made (see D7). | Phase 3 tests |
| Bylaws v1.1 | §12.2 audits | Audits are reported publicly, honoring §2.4. | The audit command line prints counts and pass/fail, with no xids by default. Its output can be published as is. | Phase 3 step 6 |
| Bylaws | §12.5 petitions | Appeals and readmissions are decided by **covenant ratings**, whose mode decides. A petition carries no personal information. | **Never run a §12.5 petition as a Pol.is round.** Agree/disagree/pass votes are not LBTAS ratings, and averaging-style maps conflict with "mode of −1 denies". | Modal help text; runbook |
| Bylaws | §13.1 no chokepoint | The Institute holds no single host, key or vendor whose removal could stop the network. | One host is acceptable only because rounds are advisory and Slack remains the venue. The "retain" key policy creates a key whose holder can de-anonymize, which is a privacy concern, not a chokepoint. | R6; Gate 1 key policy |
| Bylaws | §14.2 inspection | Members may inspect records on reasonable notice. | Bundles (CSV plus manifest) are kept and released to members on request. Destroying the key does not block this, because no record needs the key. | Phase 2 retention |
| Bylaws | §9.4 licensing | v1.0: AGPL-3. v1.1: AGPL-3.0-or-later; the specification is CC BY-SA 4.0. | Already met (repo is AGPL-3.0-or-later, decision 000). | — |
| Bylaws | Art. III, X, XI, §9.7–9.12, §9.19 | Membership tests, operator duties, mutual credit, covenant scale and chart, chain storage. | N/A: economy and covenant machinery. | — |
| Bylaws | §16.1–16.3 bootstrap | The founder board exercises the membership's powers. The Governance channel opens with recorded roll. | Rolls are tiny during bootstrap, so per-round counts may let people infer who took part. Consider a minimum-participants threshold before showing counts. *(Inferred.)* | Close-out; Phase 4 |
| JFA | L7 | "No narratives, no identities in the shared record — hashes, types, timestamps and references only." Implementation-bound. | Registry record carries only those four kinds of field (§5). Statement text and votes stay in Pol.is and the bundle, referenced by hash. | Registry record |
| JFA | L6 | The record is append-only: annotate, never erase. Implementation-bound. | Same as bylaws §2.5. Registry entries form a hash chain (`prev_record_hash`) so any rewrite is detectable. | Registry record |
| JFA | L11 | No single host, account or vendor whose removal could stop the network. Implementation-bound. | As bylaws §13.1. The bridge must stay optional to decision-making. | R6 |
| JFA | L12 | Positions and history survive any frontend and any operator. | Round records live in a repo, not only on the bridge host, so they outlive it. | Registry destination |
| JFA | P-cost-of-leaving (instrument) | Each layer is disciplined by the cost of leaving it. Governance: "members get a vote". | Supports PLAN §1: deliberation informs, members vote. Nothing further for the bridge. | §1 |
| JFA | Governance layer, frontend tier | "The synchronous/asynchronous coordination of members governed by the organization's bylaws." | The bridge serves this coordination and is bound by the bylaws rows above. | Whole design |
| JFA | P-lean-code (implementation) | *Protocol* software depends on the standard library only. | N/A as written: the bridge is not protocol software. Still keep dependencies few and pinned (CLAUDE.md). | Phase 3 scaffold |
| JFA | GOV-prosumer-membership, L10, COV-operator-dispute-witnesses (instrument) | Prosumer membership; the mutual-credit switch; dispute routing. | N/A to the bridge. | — |
| JFA | L1–L5, L8, L9; SUB-, REC-, COV- invariants | Money, reputation, substrate and record mechanics. | N/A. | — |
| Tell PR #1 | `Mycelium.append/seal/annotate/verify` | An in-process JavaScript library, in-memory store only. A record is a "dialog" of transmissions `{type, actorId, actorRole, data}` that seals once both parties have rated. | **No CLI and no HTTP API.** It is not released (v0.1.0 has no code), and its seal rule is built for two-party exchanges, not governance rounds. Not usable for the MVP (see D1). | Gate 1 registry destination |
| Tell PR #1 | SPEC §6 | Records hold structural facts and references, never free text or personal data. | Consistent with L7. Our record format mirrors it, so a later move to Tell is straightforward. | Registry record |

### 3.4 Other observations

- *(Verified)* Tell's spec says "no global chain", with per-operator logs and witnessing (§5). The JFA official document says hashes go to "one public chain" (invariant `REC-public-chain`). This is a Record-layer disagreement, not the bridge's problem. It does mean Tell's shape is still moving.
- *(Verified)* NTARI's own research note `JFA\jfa-fractal-alignment-research.md` (local store, line 212) treats Polis-style opinion mapping as something that may "inform how a synthesis is built and tested", which is consistent with PLAN §1. The curriculum note `governance-venue-rundown.md` describes the planned governance venue as "a legibility tool that confers no authority". The bridge fits that description.

## 4. Sources

GitHub, read 2026-10-12 via `gh` and `git clone`:

- `NTARI-RAND/bylaws`, `main` at `3276781f26792251d0672bc0abfd45ccba58ea1f`
  - `P1-001_Bylaws_v1.0.md`: last change `424660294879e713339b7bb40da91193ff2c055d`, blob `54d4a1e8`
  - `P1-001_Bylaws_v1.1.md`: `3276781f`, blob `34cbedda`
  - `P1-005_Governance-Venue-Policy_v1.0.md`: `3276781f`, blob `1699f144`
  - PRs: #4 merged as `3276781`; #1, #2 and #6 merged; #3 and #5 closed. None open.
- `NTARI-RAND/Janus`, `main` at `320251986ecbafc1c3259cb9325305f60cb52f01`
  - `janus-facing-architecture.md`, `jfa-conformance-suite.py` and `OPEN-QUESTIONS.md`: last change `d24e404e425481fe5c283dc38e66d7f8c7bee8d5`
  - `README.md`: last change `fc9feb47d6fa513a06bd3cbeb7b904ee7714b57d`
  - `jfa-dispute-mechanics.md` (§ "Appeals")
  - PRs #15, #16 and #18 merged 2026-10-08; #20 open (translations only)
- `NTARI-RAND/Tell`
  - `main` and tag `v0.1.0` at `64ff4895f27287380c28167614660b2ce75430d5`: README and LICENSE only
  - PR #1 head `68d726ef646fa631ac512106c0e01dd1e673a067`: `SPEC.md` (P3-013 v0.3) §§0–6 and §12, and `mycelium.js`
  - PR #2 head `ff0b6101` (rename)

Local document store (no version control):

- `C:\Users\Jodson Graves\Documents\NTARI Official Docs\Bylaws\P1-001_Bylaws_v1.0.md` (modified 2026-09-30, differs from GitHub in §6.7 and §12.5)
- `...\Bylaws\P1-001_Bylaws_v1.1-draft.md` (2026-09-22, older than GitHub v1.1)
- `...\JFA\janus-facing-architecture.md` (2026-09-17, older than GitHub)
- `...\JFA\jfa-fractal-alignment-research.md` line 212
- `...\Development\Curriculum\04-governance\governance-venue-rundown.md`

This repo: `PLAN.md` and `CLAUDE.md` at `697fa51`.

## 5. Recommendation

### 5.1 Registry record format (proposal)

Make it one JSON object per closed round, appended as one line to a JSONL file, `rounds/<YYYY>.jsonl`, in a registry repository, through a PR that a human merges.

- Every field is a hash, a type, a timestamp or a reference, as L7 and bylaws §2.4 require.
- There are no counts. Participant and statement counts go in the bundle's manifest, which the record covers by hash. This keeps the record strictly inside L7 and avoids small-roll inference during bootstrap. If the board wants counts in the record itself, that is decision D8.
- The shape can later become Tell `append()` data without change.

```json
{
  "schema": "ntari/polis-bridge/round-record/v1",
  "record_type": "deliberation_round.closed",
  "record_hash": "sha256:9f2c…e41a",
  "prev_record_hash": "sha256:41b0…7c3d",
  "annotates": null,
  "round_ref": "round:01J9Z7K6Q2V8X4M3N5P0R1S2T3",
  "federation": "governance",
  "binding": false,
  "authority_ref": "P1-001 v1.0 §6.4; P1-005 (draft)",
  "matter_ref": { "type": "github_pull_request", "ref": "NTARI-RAND/bylaws#7", "commit": "<40-hex sha>" },
  "venue_ref": {
    "polis_commit": "<40-hex sha>",
    "conversation_id": "<polis conversation id>",
    "report_id": "<polis report id>"
  },
  "bridge_ref": { "repo": "NTARI-RAND/polis-bridge", "commit": "<40-hex sha>" },
  "opened_at": "2026-11-02T15:00:00Z",
  "closes_at": "2026-11-09T15:00:00Z",
  "closed_at": "2026-11-09T15:00:04Z",
  "bundle": {
    "hash_alg": "sha256",
    "bundle_hash": "sha256:c07e…19aa",
    "manifest_hash": "sha256:5d3a…08f2",
    "bundle_ref": "bundles/2026/round-01J9Z7K6Q2V8X4M3N5P0R1S2T3/"
  },
  "admitted_set_hash": "sha256:77e1…b2c9",
  "audit": { "result": "pass", "audit_output_hash": "sha256:a4f8…3e60" },
  "key_policy": "destroyed_at_close",
  "key_destroyed_at": "2026-11-09T15:00:05Z"
}
```

Notes on the fields:

- `record_hash` is SHA-256 over the canonical JSON of the record with this field removed. Canonical means sorted keys, no extra whitespace and UTF-8.
- `prev_record_hash` chains each record to the one before it in the file, so a rewrite anywhere breaks every later hash (L6 and §2.5).
- `annotates` holds the `record_hash` of an earlier record when this record corrects it or reruns its round. In that case `record_type` is `deliberation_round.annotation`. Nothing is ever edited.
- `admitted_set_hash` is a hash of the sorted admitted xids. Anyone who later holds the bundle can check that the participants are a subset of the admitted set without the record listing a single xid.
- There is no convener field. The Slack announcement already shows who convened, and the record does not need to say it again (§2.4, "beyond what the proceeding itself requires").
- `binding: false` states PLAN §1's limit on the record itself.

### 5.2 Conflicts and decisions for Gate 1

**D1. Registry destination: the §9.5 registry, or a separate proceedings log?**

- §9.5 lists what the governance registry holds, and deliberation rounds are not on the list. The Secretary maintains it.
- Tell cannot take records today. It has no CLI or API, its release contains no code, and its seal rule assumes two rating parties.
- **Recommend:** a separate *proceedings log* (JSONL in a registry repo, via PR) under §2.5 and §5.5. The §9.5 registry then cites a round's `record_hash` only when a binding decision relies on it. The Secretary's office approves the repo and the merge path.
- This replaces the Gate 1 choice "Tell or JSONL" with "proceedings log now, Tell when it ships an append interface".

**D2. The 7-day default cites the wrong section.** PLAN §3 justifies it by §12.5's rating period. §12.5 is the appeals and readmissions procedure; the general rule is §6.4. **Recommend** citing §6.4 in the design and the decision record. The number stays at 7 days. PLAN.md itself is not edited, per the maintainer's instruction.

**D3. Prosumer placement depends on the version.** PLAN §2's "vote in one federation" matches the v1.1 draft (Covenant or Governance). The adopted v1.0 puts prosumers in Governance only. **Decide** which version the rolls follow; recommend v1.0 until v1.1 is adopted. Under v1.1, rolls change at each March equinox.

**D4. The harm rule has no policy behind it.** §6.9 requires a deliberation procedure "set by policy" that never averages harm and reopens on one documented harm. No such policy exists, and P1-005 is silent on deliberation.

- **Recommend for the MVP:** summaries show no consensus or score, only counts, the link and the hash, plus a standing reopen line under §6.7.
- **Flag for Gate 4:** the P1-005 amendment must also say how a documented harm raised in a round reopens the synthesis.

**D5. Who may convene.** §6.3 lets any member put a matter before its own federation, and §7.6 bars the Board from adding approval steps. **Options:** (a) any member of the federation convenes in that federation's channel; (b) the Vice President and Workspace Administrator offices (v1.1 §8.3, §8.6), on request. **Recommend** (a), with conveners limited to their own federations.

**D6. Vacant offices under v1.1.** v1.1 §7.3 says "governance software enforces" the freeze on a federation with a vacant office. **Decide** whether the bridge counts as such software. If yes, keep a per-federation "office vacant" flag and refuse to open rounds while it is set. This does not bite during bootstrap, when the founder board serves as the Board.

**D7. Citing invariant IDs in tests.** The bridge implements the requirements behind L6 and L7. Under bylaws §9.6 and §9.14, tests that cite those IDs are how a conformance claim is made, and CLAUDE.md currently says not to make one. Per the maintainer, the repo docs stay as they are. **Decide** whether the tests cite `L6` and `L7` by ID, or describe the behavior without the IDs until the board settles that wording.

**D8. Counts in the record.** The proposal keeps participant and statement counts in the bundle, not in the record. That keeps L7 strict and limits small-roll inference. **Decide** whether the record should carry them for visibility, as §6.5 does for ballots, and whether to set a minimum-participants threshold before counts are posted to Slack.

**D9. Member versus Slack account.** §3.4 is one vote per *member*. The roll source chosen at Gate 1 must map each member, including organization members, to exactly one Slack user.

**D10. Never for §12.5 petitions.** Record in the runbook, and in the open modal's help text, that appeals and readmissions are decided by covenant ratings under §12.5 and must not be run as Pol.is rounds.

**Housekeeping, outside this repo (for the maintainer):**

- The local store's adopted v1.0 differs from GitHub in §6.7 and §12.5.
- The local store has no v1.1 or P1-005 at GitHub's level.
- The Janus README's invariant count and "not yet published" line are stale.
- The Tell `v0.1.0` release contains no code.
