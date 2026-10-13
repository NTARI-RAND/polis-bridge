// SPDX-License-Identifier: AGPL-3.0-or-later
//
// R2 embed page script. Optional step before R1's embed (r1-embed.js):
// shared-browser mitigation (b). When window.__R1.reset is true, it first loads
// <polis>/bridge-reset.html#c=<conversation_id> in a hidden iframe. That page
// lives on the Pol.is origin (served by NTARI's proxy, not upstream) and
// removes Pol.is's stored participant token for this conversation. Only after
// it answers does this script load R1's embed with data-xid.
//
// Because the reset iframe and the Pol.is embed iframe share the same origin
// AND the same top-level page, they share the same (possibly partitioned)
// browser storage, so the reset reaches the token the embed would use.
(function () {
  var cfg = window.__R1 || {};
  var polis = cfg.polis || "http://localhost:8180";

  function loadEmbed() {
    var s = document.createElement("script");
    s.src = "/r1-embed.js";
    document.body.appendChild(s);
  }

  if (!cfg.reset) {
    loadEmbed();
    return;
  }

  var done = false;
  var f = document.createElement("iframe");
  f.style.display = "none";
  f.setAttribute("data-testid", "polis-reset");
  f.src = polis + "/bridge-reset.html#c=" + encodeURIComponent(cfg.conversation_id || "");
  window.addEventListener("message", function (ev) {
    if (done || ev.origin !== polis || !ev.data || ev.data.type !== "polis-bridge-reset") return;
    done = true;
    window.__R2_RESET = { cleared: ev.data.cleared };
    f.remove();
    loadEmbed();
  });
  // Fail closed: if the reset page never answers, do not embed.
  setTimeout(function () {
    if (!done) {
      done = true;
      window.__R2_RESET = { error: "timeout" };
      document.getElementById("mount").textContent = "Could not prepare the voting page. Please reload.";
    }
  }, 5000);
  document.body.appendChild(f);
})();
