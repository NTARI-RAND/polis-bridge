// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Runs research/r3/sql/audit.sql against the local Pol.is test database.
//
//   node tools/run-audit.mjs <round> <admitted-source>
//     <round>            a key from research/r2/.local/state.json (A, B, P, D) or a conversation_id
//     <admitted-source>  a file with one xid per line (the bridge's admitted set), or
//                        "--from-allowlist" to use Pol.is's own xid_whitelist rows for
//                        that conversation as a stand-in (test only: in production
//                        the set must come from the bridge's store)
//
// Prints counts and PASS/FAIL. Never prints xids. The admitted set reaches
// psql on stdin (a \set line), not on the command line.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PG_CONTAINER, PG_DB, lit, psql, readR2State } from "../../r2/lib/r2.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const [roundArg, source] = process.argv.slice(2);
if (!roundArg || !source) {
  console.error("usage: node tools/run-audit.mjs <round> <admitted-file | --from-allowlist>");
  process.exit(2);
}
const conv = readR2State().conversations[roundArg] ?? roundArg;
if (!/^[0-9A-Za-z]+$/.test(conv)) throw new Error("bad conversation id");

const admitted =
  source === "--from-allowlist"
    ? psql(`SELECT w.xid FROM xid_whitelist w JOIN zinvites z ON z.zid = w.zid WHERE z.zinvite = ${lit(conv)};`).map((r) => r[0])
    : readFileSync(source, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
if (admitted.some((x) => !/^[0-9A-Za-z._~:@-]+$/.test(x))) throw new Error("unexpected character in an admitted xid");

const sql = readFileSync(join(here, "..", "sql", "audit.sql"), "utf8");
const script = `\\set ON_ERROR_STOP on\n\\set conv '${conv}'\n\\set admitted '${admitted.join(",")}'\n${sql}`;
const out = execFileSync(
  "docker",
  ["exec", "-i", PG_CONTAINER, "psql", "-U", "postgres", "-d", PG_DB, "-X", "-q", "--expanded", "-f", "-"],
  { input: script, encoding: "utf8" },
);
console.log(`round ${roundArg} (admitted set: ${source === "--from-allowlist" ? "Pol.is allow-list stand-in" : "file"})`);
console.log(out.trim());
