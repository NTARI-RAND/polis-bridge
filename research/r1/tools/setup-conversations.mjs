// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Creates the R1 test fixtures in a local Pol.is through its admin API, using
// two local test admins minted by the throwaway issuer in lib/polis.mjs:
//
//   adminA owns conversation "main": 5 seed statements, xid whitelist ON
//          (use_xid_whitelist=true, xid_required=true), subscribe_type=0.
//   adminB owns conversation "domain": 5 seed statements, no xid whitelist,
//          and adminB's site domain whitelist is set to "localhost:8190" so an
//          embed from any other host should be refused.
//
// Needs the R1 host server running (it serves the JWKS Pol.is verifies against).
// Writes research/r1/.local/state.json. Safe to re-run: it creates fresh
// conversations each time.

import { adminToken, api, writeState } from "../lib/polis.mjs";

const SEEDS = [
  "Members should be able to vote on bylaws amendments from Slack.",
  "Deliberation rounds should stay open for seven days.",
  "Results should be published with a hash so anyone can check them.",
  "Votes should not be linkable to a member's Slack identity.",
  "Each federation should run its own rounds.",
];

function must(label, r, ok = [200]) {
  if (!ok.includes(r.status)) {
    throw new Error(`${label}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 400)}`);
  }
  return r.body;
}

async function makeConversation(admin, topic, settings) {
  const token = adminToken(admin.sub, admin.email);
  const created = must(
    "create conversation",
    await api("POST", "/api/v3/conversations", {
      token,
      body: { topic, description: "R1 spike test conversation (local only).", is_active: true, is_draft: false },
    }),
  );
  const conversationId = created.conversation_id;
  for (const txt of SEEDS) {
    must(
      "seed statement",
      await api("POST", "/api/v3/comments", {
        token,
        body: { conversation_id: conversationId, txt, is_seed: true, vote: 0 },
      }),
    );
  }
  must(
    "update conversation",
    await api("PUT", "/api/v3/conversations", {
      token,
      body: { conversation_id: conversationId, is_active: true, is_draft: false, subscribe_type: 0, ...settings },
    }),
  );
  return conversationId;
}

const stamp = Date.now();
const adminA = { sub: `r1-admin-a-${stamp}`, email: `r1-admin-a-${stamp}@example.test` };
const adminB = { sub: `r1-admin-b-${stamp}`, email: `r1-admin-b-${stamp}@example.test` };

const main = await makeConversation(adminA, "R1 main (xid whitelist on)", {
  use_xid_whitelist: true,
  xid_required: true,
});
const domain = await makeConversation(adminB, "R1 domain whitelist", {});
must(
  "domain whitelist",
  await api("POST", "/api/v3/domainWhitelist", {
    token: adminToken(adminB.sub, adminB.email),
    body: { domain_whitelist: "localhost:8190" },
  }),
);

writeState({ createdAt: new Date(stamp).toISOString(), adminA, adminB, conversations: { main, domain } });
console.log(JSON.stringify({ main, domain }));
