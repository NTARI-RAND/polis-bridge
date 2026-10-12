// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Creates the R2/R3 fixtures through Pol.is's admin API (no database writes),
// using three accounts from the throwaway local issuer (research/r1/lib):
//
//   A  owns "A" and "B" (two rounds, same owner) and "P" (clean round for R3):
//      xid allow-list ON (use_xid_whitelist=true, xid_required=true), subscribe_type=0
//   B  owns "D": xid allow-list ON and B's site domain whitelist = localhost:8190
//      (the production combination PLAN.md Phase 2 asks for)
//   C  an unrelated signed-in Pol.is account (owns nothing here)
//
// Needs the R2 (or R1) host server running: it serves the JWKS Pol.is checks.
// Writes research/r2/.local/state.json.

import { adminToken, api, writeR2State } from "../lib/r2.mjs";

const SEEDS = [
  "Members should be able to vote on bylaws amendments from Slack.",
  "Deliberation rounds should stay open for seven days.",
  "Results should be published with a hash so anyone can check them.",
];

function must(label, r, ok = [200]) {
  if (!ok.includes(r.status)) throw new Error(`${label}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  return r.body;
}

async function makeConversation(admin, topic, settings) {
  const token = adminToken(admin.sub, admin.email);
  const { conversation_id } = must(
    "create conversation",
    await api("POST", "/api/v3/conversations", {
      token,
      body: { topic, description: "R2/R3 spike test conversation (local only).", is_active: true, is_draft: false },
    }),
  );
  for (const txt of SEEDS) {
    must("seed", await api("POST", "/api/v3/comments", { token, body: { conversation_id, txt, is_seed: true, vote: 0 } }));
  }
  must(
    "update conversation",
    await api("PUT", "/api/v3/conversations", {
      token,
      body: { conversation_id, is_active: true, is_draft: false, subscribe_type: 0, ...settings },
    }),
  );
  return conversation_id;
}

const stamp = Date.now();
const mk = (k) => ({ sub: `r2-${k}-${stamp}`, email: `r2-${k}-${stamp}@example.test` });
const admins = { A: mk("a"), B: mk("b"), C: mk("c") };
const gate = { use_xid_whitelist: true, xid_required: true };

const conversations = {
  A: await makeConversation(admins.A, "R2 round A (allow-list on)", gate),
  B: await makeConversation(admins.A, "R2 round B (allow-list on, same owner as A)", gate),
  P: await makeConversation(admins.A, "R3 clean round (allow-list on)", gate),
  D: await makeConversation(admins.B, "R2 round D (allow-list + domain whitelist)", gate),
};
must(
  "domain whitelist",
  await api("POST", "/api/v3/domainWhitelist", {
    token: adminToken(admins.B.sub, admins.B.email),
    body: { domain_whitelist: "localhost:8190" },
  }),
);
// Make account C exist (first authenticated call auto-creates the user).
must("C exists", await api("GET", "/api/v3/users", { token: adminToken(admins.C.sub, admins.C.email) }));

writeR2State({ createdAt: new Date(stamp).toISOString(), admins, conversations });
console.log(JSON.stringify(conversations));
