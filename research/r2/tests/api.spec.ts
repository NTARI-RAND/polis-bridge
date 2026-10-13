// SPDX-License-Identifier: AGPL-3.0-or-later
//
// R2 server-side gating checks, straight against the Pol.is API (no browser).
// Runs once (project "api"). Each test attaches what it observed as
// annotations; no real person's data is involved (random test xids).

import { expect, test } from "@playwright/test";
import {
  POLIS_URL,
  adminToken,
  admit,
  api,
  lit,
  psql,
  randomXid,
  raw,
  readR2State,
  tok,
  uidOfEmail,
  uidParticipants,
  voteApi,
  xidParticipants,
  zidOf,
} from "../lib/r2.mjs";

function note(type: string, description: unknown) {
  test.info().annotations.push({ type, description: typeof description === "string" ? description : JSON.stringify(description) });
}
const errOf = (b: any) => (typeof b === "string" ? b : (b?.error ?? b?.message ?? b));
const conv = (k: string) => readR2State().conversations[k] as string;

test.describe("R2 API gating", () => {
  test("G1 enable procedure: flags set via PUT, allow-list via POST, who may call it", async () => {
    const a = conv("A");
    const [flags] = psql(`SELECT use_xid_whitelist, xid_required FROM conversations WHERE zid = ${zidOf(a)};`);
    note("db-flags(use_xid_whitelist,xid_required)", flags);
    expect(flags).toEqual(["t", "t"]);

    const x = randomXid();
    const results = {
      postNoToken: (await admit(a, [x], { token: null })).status,
      postOtherSignedInAccount: await admit(a, [x], { who: "C" }).then((r) => `${r.status} ${errOf(r.body)}`),
      postOwner: (await admit(a, [x])).status,
      postEmptyList: await admit(a, []).then((r) => `${r.status} ${errOf(r.body)}`),
      getOwner: (await api("GET", "/api/v3/xidAllowList", { token: tok("A"), query: { conversation_id: a } })).status,
      getOtherSignedInAccount: (await api("GET", "/api/v3/xidAllowList", { token: tok("C"), query: { conversation_id: a } })).status,
    };
    note("allow-list-api-status", results);
    const [[n, zidSet]] = psql(
      `SELECT count(*), bool_and(zid = ${zidOf(a)}) FROM xid_whitelist WHERE xid = ${lit(x)};`,
    );
    note("db-row-for-admitted-xid(count,scoped-to-conversation)", [n, zidSet]);
    expect(results.postNoToken).toBe(401);
    expect(results.postOtherSignedInAccount).toMatch(/^403/);
    expect(results.postOwner).toBe(200);
    expect(n).toBe("1");
    expect(zidSet).toBe("t");
  });

  test("G2 non-admitted xid cannot join or vote; no xid is refused too", async () => {
    const a = conv("A");
    const x = randomXid();
    const init = await api("GET", "/api/v3/participationInit", { query: { conversation_id: a, xid: x } });
    const vote = await voteApi(a, { xid: x });
    const noXid = await voteApi(a, {});
    note("participationInit", { status: init.status, error: errOf(init.body) });
    note("vote", { status: vote.status, error: errOf(vote.body) });
    note("vote-without-xid", { status: noXid.status, error: errOf(noXid.body) });
    const [[xidRows]] = psql(`SELECT count(*) FROM xids WHERE xid = ${lit(x)};`);
    note("xids-rows-written", xidRows);
    expect(vote.status).toBe(403);
    expect(errOf(vote.body)).toContain("polis_err_xid_not_allowed");
    expect(noXid.status).toBe(403);
    expect(xidRows).toBe("0");
  });

  test("G3 runtime admission takes effect on the very next request", async () => {
    const a = conv("A");
    const x = randomXid();
    const before = await voteApi(a, { xid: x });
    const t0 = Date.now();
    expect((await admit(a, [x])).status).toBe(200);
    const after = await voteApi(a, { xid: x });
    note("before/after/ms", { before: before.status, after: after.status, ms: Date.now() - t0 });
    expect(before.status).toBe(403);
    expect(after.status).toBe(200);
    expect(xidParticipants(a, x)[0]?.votes).toBe(1);
  });

  test("G4 removing an xid from the list does not stop someone who already joined", async () => {
    const a = conv("A");
    const [x1, x2, x3] = [randomXid(), randomXid(), randomXid()];
    expect((await admit(a, [x1, x2])).status).toBe(200);
    const first = await voteApi(a, { xid: x1, tid: 0 });
    expect(first.status).toBe(200);
    const participantToken = first.body?.auth?.token as string | undefined;
    note("vote-response-carries-participant-token", Boolean(participantToken));

    // "Remove" x1: the only removal path is replace_all with the list to keep.
    const rep = await admit(a, [x2], { replaceAll: true });
    const [[stillListed]] = psql(`SELECT count(*) FROM xid_whitelist WHERE xid = ${lit(x1)};`);
    note("replace_all-status / x1-rows-left", { status: rep.status, rows: stillListed });
    expect(stillListed).toBe("0");

    const noToken = await voteApi(a, { xid: x1, tid: 1 });
    const withToken = await voteApi(a, { xid: x1, tid: 2, token: participantToken });
    const neverAdmitted = await voteApi(a, { xid: x3, tid: 0 });
    note("after-removal", {
      xidOnlyNoToken: noToken.status,
      xidPlusOldToken: withToken.status,
      neverAdmittedControl: neverAdmitted.status,
      votesUnderX1: xidParticipants(a, x1),
    });
    // Finding: removal does NOT revoke. (Assert what we observed so the run documents it.)
    expect(noToken.status).toBe(200);
    expect(withToken.status).toBe(200);
    expect(neverAdmitted.status).toBe(403);
  });

  test("G5 same owner, two rounds: an xid used in round A gets into round B", async () => {
    const [a, b] = [conv("A"), conv("B")];
    // (i) admitted to A, voted in A, never admitted to B.
    const xa = randomXid();
    await admit(a, [xa]);
    expect((await voteApi(a, { xid: xa })).status).toBe(200);
    const intoB = await voteApi(b, { xid: xa });
    // (ii) admitted to A but never used anywhere: B refuses it.
    const xu = randomXid();
    await admit(a, [xu]);
    const unusedIntoB = await voteApi(b, { xid: xu });
    // (iii) admitted to A (unused), then ALSO admitted to B: the B admission is a silent no-op.
    const xs = randomXid();
    await admit(a, [xs]);
    const admitB = await admit(b, [xs]);
    const rows = psql(`SELECT zid FROM xid_whitelist WHERE xid = ${lit(xs)};`).map((r) => Number(r[0]));
    const sInB = await voteApi(b, { xid: xs });
    note("i-used-in-A-then-B", { status: intoB.status, participantsInB: xidParticipants(b, xa) });
    note("ii-admitted-A-unused-then-B", { status: unusedIntoB.status, error: errOf(unusedIntoB.body) });
    note("iii-admitted-A-then-admitted-B", {
      admitBStatus: admitB.status,
      allowListRowsZids: rows.map((z) => (z === zidOf(a) ? "A" : z === zidOf(b) ? "B" : z)),
      voteInB: sInB.status,
      error: errOf(sInB.body),
    });
    expect(intoB.status).toBe(200); // bypass (desk caveat b) confirmed
    expect(unusedIntoB.status).toBe(403);
    expect(admitB.status).toBe(200);
    expect(rows.length).toBe(1); // UNIQUE(owner, xid): no row for B was added
    expect(sInB.status).toBe(403); // admitted-to-B xid is refused in B
  });

  test("G6 signed-in Pol.is accounts skip the allow-list", async () => {
    const a = conv("A");
    const s = readR2State();
    const uidC = uidOfEmail(s.admins.C.email);
    const plain = await voteApi(a, { tid: 0, token: tok("C") });
    const withBadXid = await voteApi(a, { tid: 1, token: tok("C"), xid: randomXid() });
    // A brand-new account minted by the trusted issuer: Pol.is creates it on first use.
    const fresh = { sub: `r2-fresh-${Date.now()}`, email: `r2-fresh-${Date.now()}@example.test` };
    const freshVote = await voteApi(a, { tid: 0, token: adminToken(fresh.sub, fresh.email) });
    const [[freshOwnerFlag, freshMapped]] = psql(
      `SELECT u.is_owner, (SELECT count(*) FROM oidc_user_mappings m WHERE m.uid = u.uid) FROM users u WHERE u.email = ${lit(fresh.email)};`,
    );
    note("signed-in-C", { noXid: plain.status, nonAdmittedXid: withBadXid.status, participantsForC: uidParticipants(a, uidC) });
    note("fresh-account-first-call", { vote: freshVote.status, users_is_owner: freshOwnerFlag, oidc_mapping_rows: freshMapped });
    expect(plain.status).toBe(200);
    expect(withBadXid.status).toBe(200);
    expect(freshVote.status).toBe(200);
  });

  test("G8a domain whitelist (API view): what the check reads, and where it is not applied", async () => {
    const d = conv("D");
    const x = randomXid();
    expect((await admit(d, [x], { who: "B" })).status).toBe(200);
    const initUrl = `${POLIS_URL}/api/v3/participationInit?conversation_id=${d}&xid=${x}`;
    const iframeRef = (parent: string) =>
      `${POLIS_URL}/${d}?parent_url=${encodeURIComponent(parent)}&referrer=&xid=${x}&subscribe_type=0`;
    const r = {
      noReferer: await raw("GET", initUrl),
      refererApprovedParent: await raw("GET", initUrl, { Referer: iframeRef("http://localhost:8190/embed.html") }),
      refererOtherParent: await raw("GET", initUrl, { Referer: iframeRef("http://127.0.0.1:8190/embed.html") }),
      refererPolisOriginOnly: await raw("GET", initUrl, { Referer: `${POLIS_URL}/` }),
      refererApprovedHostDirect: await raw("GET", initUrl, { Referer: "http://localhost:8190/embed.html" }),
    };
    const voteNoReferer = await voteApi(d, { xid: x });
    const summary = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, `${v.status} ${v.status === 200 ? "" : errOf(v.body)}`.trim()]));
    note("participationInit-by-Referer", summary);
    note("POST-votes-no-Referer", voteNoReferer.status);
    expect(r.noReferer.status).toBe(403);
    expect(r.refererApprovedParent.status).toBe(200); // a hand-made Referer passes: forgeable
    expect(r.refererOtherParent.status).toBe(403);
    expect(r.refererPolisOriginOnly.status).toBe(403);
    expect(voteNoReferer.status).toBe(200); // the domain check is not applied to votes
  });
});
