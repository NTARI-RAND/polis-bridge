// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Creates fresh R2 fixtures unless R2_REUSE_STATE=1 and a state file exists.
import { hasR2State } from "../lib/r2.mjs";

export default async function globalSetup() {
  if (process.env.R2_REUSE_STATE === "1" && hasR2State()) return;
  await import("../tools/setup.mjs");
}
