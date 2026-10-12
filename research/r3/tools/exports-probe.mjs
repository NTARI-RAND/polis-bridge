// SPDX-License-Identifier: AGPL-3.0-or-later
//
// R3 spike: which export files exist, who can download them, and can the
// bridge create the report itself. Uses round "P" from research/r2 setup
// (owner A, allow-list on) and the R2/R1 helpers (throwaway local issuer).
//
// It admits three random test xids, votes with them through the API, creates a
// report through the API, then fetches every export with and without a login.
// Output: status, content type, header row and row count per file. No xid
// values are printed (header rows only). The admitted set is saved to
// research/r3/.local/admitted-P.txt for the audit (tools/run-audit.mjs).
//
// Usage: node tools/exports-probe.mjs   (stack and R2 host server running)

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { POLIS_URL, admit, api, lit, psql, randomXid, raw, readR2State, tok, voteApi, zidOf } from "../../r2/lib/r2.mjs";

const LOCAL = join(dirname(fileURLToPath(import.meta.url)), "..", ".local");
mkdirSync(LOCAL, { recursive: true });
const out = {};
const P = readR2State().conversations.P;

// 1. Participation: three admitted xids vote (varied), one also writes a statement.
const xids = [randomXid(), randomXid(), randomXid()];
out.admit = (await admit(P, xids)).status;
let participantToken;
for (const [i, xid] of xids.entries()) {
  for (const tid of [0, 1, 2]) {
    const r = await api("POST", "/api/v3/votes", { body: { conversation_id: P, xid, tid, vote: [-1, 1, 0][(i + tid) % 3] } });
    if (r.status !== 200) throw new Error(`vote ${r.status}`);
    participantToken ??= r.body?.auth?.token;
  }
}
const comment = await api("POST", "/api/v3/comments", {
  token: participantToken,
  body: { conversation_id: P, txt: "R3 test statement written by a participant.", xid: xids[0] },
});
out.participantComment = comment.status;
writeFileSync(join(LOCAL, "admitted-P.txt"), xids.join("\n") + "\n");

// 2. Report: created and found through the API by the owner.
const created = await api("POST", "/api/v3/reports", { token: tok("A"), body: { conversation_id: P } });
const listed = await api("GET", "/api/v3/reports", { token: tok("A"), query: { conversation_id: P } });
const reportId = Array.isArray(listed.body) ? listed.body[0]?.report_id : undefined;
out.report = { createStatus: created.status, listStatus: listed.status, gotReportId: Boolean(reportId) };
out.reportListNoLogin = (await api("GET", "/api/v3/reports", { query: { conversation_id: P } })).status;
out.reportListOtherAccount = (await api("GET", "/api/v3/reports", { token: tok("C"), query: { conversation_id: P } })).status;

// 3. Every reportExport type, without and with a login.
const types = [
  "summary.csv",
  "comments.csv",
  "votes.csv",
  "participant-votes.csv",
  "participant-importance.csv",
  "comment-groups.csv",
  "comment-clusters.csv",
  "format.json",
];
const describe = (r) => {
  const text = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
  const lines = text.split("\n").filter((l) => l.length);
  return {
    status: r.status,
    header: r.status === 200 ? lines[0]?.slice(0, 200) : String(text).slice(0, 80),
    dataRows: r.status === 200 ? Math.max(lines.length - 1, 0) : null,
  };
};
out.reportExport = {};
for (const t of types) {
  const url = `${POLIS_URL}/api/v3/reportExport/${reportId}/${t}`;
  const anon = await raw("GET", url);
  const owner = await raw("GET", url, { Authorization: `Bearer ${tok("A")}` });
  out.reportExport[t] = { noLogin: describe(anon), owner: { status: owner.status } };
}

// 4. The xid <-> participant mapping: the conversation UUID, then the public CSV.
const uuidBy = {};
for (const [who, token] of [
  ["owner", tok("A")],
  ["otherSignedInAccount", tok("C")],
  ["participantToken(xid)", participantToken],
  ["noLogin", undefined],
]) {
  const r = await api("GET", "/api/v3/conversationUuid", { token, query: { conversation_id: P } });
  uuidBy[who] = { status: r.status, gotUuid: Boolean(r.body?.conversation_uuid) };
  if (r.body?.conversation_uuid) uuidBy._uuid = r.body.conversation_uuid;
}
const uuid = uuidBy._uuid;
delete uuidBy._uuid;
out.conversationUuid = uuidBy;
out.xidCsvNoLogin = describe(await raw("GET", `${POLIS_URL}/api/v3/xid/${uuid}-xid.csv`));
out.xidsCsvOwner = describe(await raw("GET", `${POLIS_URL}/api/v3/xids/csv?conversation_id=${P}`, { Authorization: `Bearer ${tok("A")}` }));
out.xidsCsvNoLogin = { status: (await raw("GET", `${POLIS_URL}/api/v3/xids/csv?conversation_id=${P}`)).status };

// 5. Email: can a participant still hand over an email when subscribe_type=0?
const zid = zidOf(P);
const [[subscribeType]] = psql(`SELECT subscribe_type FROM conversations WHERE zid = ${zid};`);
const sub = await api("POST", "/api/v3/convSubscriptions", {
  token: participantToken,
  body: { conversation_id: P, type: 1, email: "r3-subscribe-test@example.test" },
});
const [[stored]] = psql(`SELECT count(*) FROM participants_extended WHERE zid = ${zid} AND subscribe_email IS NOT NULL;`);
out.emailSubscribe = { conversationSubscribeType: subscribeType, postStatus: sub.status, rowsWithSubscribeEmail: stored };
// Clean up the test email again (exactly what an operator purge would do for one row).
psql(`UPDATE participants_extended SET subscribe_email = NULL WHERE zid = ${zid} AND subscribe_email = ${lit("r3-subscribe-test@example.test")};`);

// 6. What Pol.is recorded about the participants' arrival (participants_extended).
const [[n, withReferrer, refHasXid, withParentUrl, withOrigin]] = psql(`
  SELECT count(*), count(referrer), count(*) FILTER (WHERE referrer LIKE '%xid=%'),
         count(parent_url), count(origin)
  FROM participants_extended WHERE zid = ${zid};`);
out.participantsExtended = { rows: n, withReferrer, referrerContainsXid: refHasXid, withParentUrl, withOrigin };

writeFileSync(join(LOCAL, "exports-probe.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
