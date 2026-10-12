// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Creates fresh test conversations before the run. Set R1_REUSE_STATE=1 to
// reuse research/r1/.local/state.json from a previous run instead.
import { existsSync } from "node:fs";
import { STATE_FILE } from "../lib/polis.mjs";

export default async function globalSetup() {
  if (process.env.R1_REUSE_STATE === "1" && existsSync(STATE_FILE)) return;
  await import("../tools/setup-conversations.mjs");
}
