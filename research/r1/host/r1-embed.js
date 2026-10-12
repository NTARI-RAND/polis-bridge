// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Builds the legacy Pol.is embed the way the bridge's embed page would:
// a <div class="polis"> with data-* attributes, then loads embed.js from the
// Pol.is host. Config is read from window.__R1 (the Playwright test sets it
// with addInitScript, so no xid ever appears in this page's URL).
//
// Desk recommendation applied: explicit data-parent_url with no query string,
// data-subscribe_type=0 (no email prompt).
(function () {
  var cfg = window.__R1;
  if (!cfg || !cfg.conversation_id) {
    document.getElementById("mount").textContent = "No window.__R1 config.";
    return;
  }
  var d = document.createElement("div");
  d.className = "polis";
  d.setAttribute("data-conversation_id", cfg.conversation_id);
  d.setAttribute("data-parent_url", window.location.origin + window.location.pathname);
  d.setAttribute("data-subscribe_type", "0");
  if (cfg.xid) d.setAttribute("data-xid", cfg.xid);
  if (cfg.ucv !== undefined) d.setAttribute("data-ucv", String(cfg.ucv));
  if (cfg.ucw !== undefined) d.setAttribute("data-ucw", String(cfg.ucw));
  if (cfg.ucsh !== undefined) d.setAttribute("data-ucsh", String(cfg.ucsh));
  d.setAttribute("data-height", "900");
  document.getElementById("mount").appendChild(d);

  var s = document.createElement("script");
  s.src = (cfg.polis || "http://localhost:8180") + "/embed.js";
  s.async = true;
  document.body.appendChild(s);
})();
