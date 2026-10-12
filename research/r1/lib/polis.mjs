// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Shared helpers for the R1 spike: a throwaway local "OIDC issuer" (one RSA
// key + JWKS) so a local admin account can call Pol.is's admin API, a tiny
// API client, and a psql helper that reads the local Pol.is database.
//
// Local-only test tooling. The signing key is generated on first use and kept
// in research/r1/.local/ (gitignored). It is not a secret of any real system.

import { execFileSync } from "node:child_process";
import {
  createPrivateKey,
  createPublicKey,
  createSign,
  generateKeyPairSync,
  randomBytes,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const R1_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
export const LOCAL_DIR = join(R1_DIR, ".local");
export const STATE_FILE = join(LOCAL_DIR, "state.json");
const KEY_FILE = join(LOCAL_DIR, "local-issuer-signing.pem");

// Must match the Pol.is .env used for the run (see README.md).
export const POLIS_URL = process.env.POLIS_URL ?? "http://localhost:8180";
export const HOST_PORT = Number(process.env.R1_HOST_PORT ?? 8190);
export const PG_CONTAINER = process.env.POLIS_PG_CONTAINER ?? "polis-r1-postgres-1";
export const PG_DB = process.env.POLIS_PG_DB ?? "polis-dev";
export const OIDC_ISSUER = process.env.R1_OIDC_ISSUER ?? "https://r1-local-issuer.test/";
export const OIDC_AUDIENCE = process.env.R1_OIDC_AUDIENCE ?? "users";
const KID = "r1-local-issuer-1";

function loadOrCreateKey() {
  if (!existsSync(KEY_FILE)) {
    mkdirSync(LOCAL_DIR, { recursive: true });
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    writeFileSync(KEY_FILE, privateKey.export({ type: "pkcs8", format: "pem" }));
  }
  return createPrivateKey(readFileSync(KEY_FILE));
}

/** JWKS document Pol.is fetches (JWKS_URI) to verify the local admin token. */
export function jwks() {
  const jwk = createPublicKey(loadOrCreateKey()).export({ format: "jwk" });
  return { keys: [{ ...jwk, kid: KID, use: "sig", alg: "RS256" }] };
}

const b64url = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

/** Mint an RS256 OIDC-style access token for a local test admin. */
export function adminToken(sub, email) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: KID };
  const payload = {
    iss: OIDC_ISSUER,
    aud: OIDC_AUDIENCE,
    sub,
    email,
    email_verified: true,
    name: sub,
    iat: now,
    exp: now + 3600,
  };
  const input = `${b64url(header)}.${b64url(payload)}`;
  const sig = createSign("RSA-SHA256").update(input).sign(loadOrCreateKey()).toString("base64url");
  return `${input}.${sig}`;
}

/** Call the Pol.is API. Returns { status, body }. Never throws on HTTP errors. */
export async function api(method, path, { token, body, query } = {}) {
  const url = new URL(path, POLIS_URL);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
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

/** Run one SQL statement in the local Pol.is Postgres container; returns rows as arrays of strings. */
export function psql(sql) {
  const out = execFileSync(
    "docker",
    ["exec", PG_CONTAINER, "psql", "-U", "postgres", "-d", PG_DB, "-At", "-F", "|", "-c", sql],
    { encoding: "utf8" },
  );
  return out
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => l.split("|"));
}

/** Escape a value for a single-quoted SQL literal (test data only). */
export const lit = (s) => `'${String(s).replaceAll("'", "''")}'`;

/** A random 32-character lowercase hex xid: the shape PLAN.md §3 derives. */
export const randomXid = () => randomBytes(16).toString("hex");

export function readState() {
  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}

export function writeState(state) {
  mkdirSync(LOCAL_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/** Admit xids to a conversation's xid allow-list (POST /api/v3/xidAllowList). */
export async function admitXids(conversationId, xids) {
  const { adminA } = readState();
  return api("POST", "/api/v3/xidAllowList", {
    token: adminToken(adminA.sub, adminA.email),
    body: { conversation_id: conversationId, xid_allow_list: xids },
  });
}

/**
 * Where did this xid's votes land? Returns one row per participant joined to
 * the xid, with that participant's vote count, for the given conversation.
 */
export function votesForXid(conversationId, xid) {
  return psql(`
    SELECT x.xid, p.pid, p.uid, (SELECT count(*) FROM votes v WHERE v.zid = p.zid AND v.pid = p.pid)
    FROM xids x
    JOIN participants p ON p.zid = x.zid AND p.uid = x.uid
    WHERE x.zid = (SELECT zid FROM zinvites WHERE zinvite = ${lit(conversationId)})
      AND x.xid = ${lit(xid)};`).map(([x, pid, uid, n]) => ({ xid: x, pid: Number(pid), uid: Number(uid), votes: Number(n) }));
}

/** Total participants and votes in a conversation. */
export function conversationTotals(conversationId) {
  const [[participants, votes]] = psql(`
    SELECT (SELECT count(*) FROM participants WHERE zid = z.zid), (SELECT count(*) FROM votes WHERE zid = z.zid)
    FROM zinvites z WHERE z.zinvite = ${lit(conversationId)};`);
  return { participants: Number(participants), votes: Number(votes) };
}
