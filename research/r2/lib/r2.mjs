// SPDX-License-Identifier: AGPL-3.0-or-later
//
// R2/R3 helpers on top of research/r1/lib/polis.mjs (admin-token minting via
// the throwaway local issuer, API client, psql helper). Only the run state is
// separate: research/r2/.local/state.json (gitignored).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { adminToken, api, lit, psql } from "../../r1/lib/polis.mjs";

export * from "../../r1/lib/polis.mjs";

export const R2_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
export const R2_LOCAL = join(R2_DIR, ".local");
export const R2_STATE = join(R2_LOCAL, "state.json");

export const readR2State = () => JSON.parse(readFileSync(R2_STATE, "utf8"));
export const hasR2State = () => existsSync(R2_STATE);
export function writeR2State(s) {
  mkdirSync(R2_LOCAL, { recursive: true });
  writeFileSync(R2_STATE, JSON.stringify(s, null, 2));
}

/** Bearer token for one of the state's test accounts ("A", "B" or "C"). */
export function tok(who) {
  const a = readR2State().admins[who];
  return adminToken(a.sub, a.email);
}

/** POST /api/v3/xidAllowList as `who` (default: the owner "A"). */
export function admit(conversationId, xids, { who = "A", replaceAll, token } = {}) {
  return api("POST", "/api/v3/xidAllowList", {
    token: token === undefined ? tok(who) : token,
    body: { conversation_id: conversationId, xid_allow_list: xids, ...(replaceAll ? { replace_all: true } : {}) },
  });
}

/** POST /api/v3/votes straight to the API (no browser). Agree on statement `tid`. */
export function voteApi(conversationId, { xid, tid = 0, token } = {}) {
  return api("POST", "/api/v3/votes", {
    token,
    body: { conversation_id: conversationId, ...(xid ? { xid } : {}), tid, vote: -1 },
  });
}

/** Low-level fetch for cases api() can't express (custom Referer etc.). */
export async function raw(method, url, headers = {}, body) {
  const res = await fetch(url, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let parsed = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { status: res.status, body: parsed };
}

export const zidOf = (conversationId) => Number(psql(`SELECT zid FROM zinvites WHERE zinvite = ${lit(conversationId)};`)[0][0]);

/**
 * Participants in this conversation tied to this xid (joined by owner + uid,
 * which is how Pol.is itself resolves an xid; xids.zid is only the FIRST
 * conversation the xid was seen in) and their vote counts.
 */
export function xidParticipants(conversationId, xid) {
  return psql(`
    SELECT p.pid, (SELECT count(*) FROM votes v WHERE v.zid = p.zid AND v.pid = p.pid)
    FROM zinvites z JOIN conversations c ON c.zid = z.zid
    JOIN xids x ON x.owner = c.owner AND x.xid = ${lit(xid)}
    JOIN participants p ON p.zid = z.zid AND p.uid = x.uid
    WHERE z.zinvite = ${lit(conversationId)};`).map(([pid, n]) => ({ pid: Number(pid), votes: Number(n) }));
}

/** Participants (and their votes) for a signed-in account's uid in a conversation. */
export function uidParticipants(conversationId, uid) {
  return psql(`
    SELECT p.pid, (SELECT count(*) FROM votes v WHERE v.zid = p.zid AND v.pid = p.pid)
    FROM zinvites z JOIN participants p ON p.zid = z.zid AND p.uid = ${Number(uid)}
    WHERE z.zinvite = ${lit(conversationId)};`).map(([pid, n]) => ({ pid: Number(pid), votes: Number(n) }));
}

export const uidOfEmail = (email) => Number(psql(`SELECT uid FROM users WHERE email = ${lit(email)};`)[0]?.[0] ?? -1);
