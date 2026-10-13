// SPDX-License-Identifier: AGPL-3.0-or-later
//
// R2 browser checks (Chromium and WebKit), run with Pol.is in production mode
// (DEV_MODE=false), the setting R1 could not test:
//   W1-W4  domain whitelist: what reaches the check, and which Referrer-Policy
//          the bridge page and the Pol.is pages may use
//   W5-W7  shared browser: mitigation (b), a reset page on the Pol.is origin
//          served by NTARI's proxy, versus no mitigation; and a signed-in
//          Pol.is account in the same browser.
// xids are random test values; Referers are recorded with the xid redacted.

import { expect, test, type Page, type Request, type Response } from "@playwright/test";
import { POLIS_URL, admit, readR2State, randomXid, tok, uidOfEmail, uidParticipants, xidParticipants } from "../lib/r2.mjs";

type Cfg = { conversation_id: string; xid?: string; reset?: boolean };
const FRAME = 'iframe[data-testid="polis-iframe"]';
const conv = (k: string) => readR2State().conversations[k] as string;
const redact = (s: string) => s.replace(/xid=[^&]*/g, "xid=<redacted>");

function note(type: string, description: unknown) {
  test.info().annotations.push({ type, description: typeof description === "string" ? description : JSON.stringify(description) });
}

async function open(page: Page, cfg: Cfg, url = "http://localhost:8190/embed-r2.html") {
  await page.addInitScript((c) => {
    (window as any).__R1 = c;
  }, cfg);
  await page.goto(url);
  await expect(page.locator(FRAME)).toHaveCount(1, { timeout: 20_000 });
  return page.frameLocator(FRAME);
}

const isVotePost = (r: Response) => r.url().includes("/api/v3/votes") && r.request().method() === "POST";

async function tryVote(page: Page) {
  const frame = page.frameLocator(FRAME);
  const visible = await frame
    .locator("#agreeButton")
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!visible) return { status: null as number | null, ui: "no voting UI" };
  const [res] = await Promise.all([page.waitForResponse(isVotePost), frame.locator("#agreeButton").click()]);
  return { status: res.status() as number | null, ui: "voted" };
}

/** Record participationInit status + Referer, and the Referer of the iframe's own page load. */
function watch(page: Page) {
  const seen: { initStatus?: number; initReferer?: string; iframeNavReferer?: string } = {};
  page.on("request", async (r: Request) => {
    const u = r.url();
    if (u.includes("/api/v3/participationInit")) seen.initReferer = redact((await r.allHeaders())["referer"] ?? "(none)");
    else if (r.isNavigationRequest() && r.frame() !== page.mainFrame() && u.startsWith(POLIS_URL) && !u.includes("bridge-reset"))
      seen.iframeNavReferer = redact((await r.allHeaders())["referer"] ?? "(none)");
  });
  page.on("response", (r) => {
    if (r.url().includes("/api/v3/participationInit")) seen.initStatus = r.status();
  });
  return seen;
}

test.describe("R2 domain whitelist, DEV_MODE=false", () => {
  test("W1 approved domain, bridge page with default Referrer-Policy: votes", async ({ page }) => {
    const d = conv("D");
    const xid = randomXid();
    await admit(d, [xid], { who: "B" });
    const seen = watch(page);
    await open(page, { conversation_id: d, xid });
    const v = await tryVote(page);
    note("observed", { ...seen, vote: v });
    expect(v.status).toBe(200);
  });

  test("W2 approved domain, bridge page sends Referrer-Policy: no-referrer: still votes", async ({ page }) => {
    const d = conv("D");
    const xid = randomXid();
    await admit(d, [xid], { who: "B" });
    const seen = watch(page);
    await open(page, { conversation_id: d, xid }, "http://localhost:8190/embed-r2-noref.html");
    const v = await tryVote(page);
    note("observed", { ...seen, vote: v });
    expect(v.status).toBe(200);
    expect(seen.iframeNavReferer).toBe("(none)");
  });

  for (const rp of ["same-origin", "strict-origin", "strict-origin-when-cross-origin", "origin"]) {
    test(`W2b approved domain, bridge page Referrer-Policy: ${rp}`, async ({ page }) => {
      const d = conv("D");
      const xid = randomXid();
      await admit(d, [xid], { who: "B" });
      const seen = watch(page);
      await open(page, { conversation_id: d, xid }, `http://localhost:8190/embed-r2-rp.html?rp=${rp}`);
      const v = await tryVote(page);
      note("observed", { policy: rp, ...seen, vote: v });
      expect(v.status).toBe(200);
    });
  }

  test("W3 other site (127.0.0.1:8190): refused", async ({ page }) => {
    const d = conv("D");
    const xid = randomXid();
    await admit(d, [xid], { who: "B" });
    const seen = watch(page);
    await open(page, { conversation_id: d, xid }, "http://127.0.0.1:8190/embed-r2.html");
    const v = await tryVote(page);
    note("observed", { ...seen, vote: v });
    expect(seen.initStatus).toBe(403);
    expect(v.status === null || v.status !== 200).toBe(true);
  });

  test("W4 approved domain but Pol.is pages served with Referrer-Policy: no-referrer: breaks", async ({ page }) => {
    const d = conv("D");
    const xid = randomXid();
    await admit(d, [xid], { who: "B" });
    // Simulate a proxy adding the header to Pol.is's conversation page.
    await page.route(new RegExp(`^${POLIS_URL}/${d}\\?`), async (route) => {
      const resp = await route.fetch();
      await route.fulfill({ response: resp, headers: { ...resp.headers(), "referrer-policy": "no-referrer" } });
    });
    const seen = watch(page);
    await open(page, { conversation_id: d, xid });
    const v = await tryVote(page);
    note("observed", { ...seen, vote: v });
    expect(seen.initStatus).toBe(403);
  });
});

test.describe("R3 preview: third-party requests from the participation page", () => {
  test("W8 hosts other than Pol.is and the bridge contacted by the embed (blocked, not sent)", async ({ page }) => {
    const a = conv("A");
    const xid = randomXid();
    await admit(a, [xid]);
    const external = new Set<string>();
    await page.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, async (route) => {
      const u = new URL(route.request().url());
      external.add(`${u.protocol}//${u.host}${u.pathname}`);
      await route.abort();
    });
    await open(page, { conversation_id: a, xid });
    const v = await tryVote(page);
    note("external-requests-attempted", [...external]);
    note("vote-with-them-blocked", v);
    expect(v.status).toBe(200);
  });
});

test.describe("R2 shared browser, DEV_MODE=false", () => {
  test("W5 control, no mitigation: second member's vote lands on the first member", async ({ page }) => {
    const a = conv("A");
    const [x1, x2] = [randomXid(), randomXid()];
    await admit(a, [x1, x2]);
    await open(page, { conversation_id: a, xid: x1 });
    expect((await tryVote(page)).status).toBe(200);
    const keys = await page
      .frames()
      .find((f) => f.url().startsWith(POLIS_URL))
      ?.evaluate(() => ({
        local: Object.keys(localStorage),
        session: Object.keys(sessionStorage),
        cookies: document.cookie ? document.cookie.split(";").map((c) => c.split("=")[0].trim()) : [],
      }));
    note("polis-origin-storage-key-names-after-first-vote", keys);
    await open(page, { conversation_id: a, xid: x2 });
    const v2 = await tryVote(page);
    note("second", { vote: v2, x1: xidParticipants(a, x1), x2: xidParticipants(a, x2) });
    expect(xidParticipants(a, x2)).toHaveLength(0); // merged (R1 C5 reproduced in prod mode)
  });

  test("W6 mitigation (b): reset page on the Pol.is origin before each embed", async ({ page }) => {
    const a = conv("A");
    const [x1, x2] = [randomXid(), randomXid()];
    await admit(a, [x1, x2]);
    await open(page, { conversation_id: a, xid: x1, reset: true });
    expect((await tryVote(page)).status).toBe(200);
    const r1 = await page.evaluate(() => (window as any).__R2_RESET);

    await open(page, { conversation_id: a, xid: x2, reset: true });
    const v2 = await tryVote(page);
    const r2 = await page.evaluate(() => (window as any).__R2_RESET);

    // First member comes back on the same browser: same participant as before?
    await open(page, { conversation_id: a, xid: x1, reset: true });
    const v3 = await tryVote(page);
    const p1 = xidParticipants(a, x1);
    const p2 = xidParticipants(a, x2);
    note("reset-results(first,second)", [r1, r2]);
    note("votes", { second: v2, firstAgain: v3, x1: p1, x2: p2 });
    expect(r2.cleared).toBeGreaterThanOrEqual(1);
    expect(v2.status).toBe(200);
    expect(p2).toHaveLength(1);
    expect(p2[0].votes).toBe(1);
    expect(p1).toHaveLength(1);
    expect(p1[0].pid).not.toBe(p2[0].pid);
    expect(p1[0].votes).toBe(2);
  });

  test("W7 signed-in Pol.is account in the same browser: embed votes as that account, xid ignored", async ({ page }, info) => {
    // A different round per engine, so account C still has statements left to vote on.
    const a = conv(info.project.name === "webkit" ? "B" : "A");
    const s = readR2State();
    const xid = randomXid();
    await admit(a, [xid]);
    // Simulate an admin/member who signed in to Pol.is in this browser: the OIDC
    // client keeps its access token in Pol.is-origin storage under "oidc.user*".
    const accessToken = tok("C");
    await page.addInitScript(
      ({ origin, accessToken }) => {
        if (location.origin !== origin) return;
        localStorage.setItem(
          "oidc.user:r2-local:dev-client-id",
          // Both shapes the legacy client reads: index.ejs (access_token/expires_at)
          // and the bundle's polisStorage.js (body.access_token/expiresAt).
          JSON.stringify({
            access_token: accessToken,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            body: { access_token: accessToken },
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
          }),
        );
      },
      { origin: POLIS_URL, accessToken },
    );
    const uidC = uidOfEmail(s.admins.C.email);
    const before = uidParticipants(a, uidC);
    const auth: string[] = [];
    page.on("request", (r) => {
      if (!r.url().startsWith(POLIS_URL + "/api/v3/")) return;
      const h = r.headers()["authorization"];
      let kind = "none";
      if (h) {
        try {
          const p = JSON.parse(Buffer.from(h.split(".")[1], "base64url").toString());
          kind = p.xid ? "participant-token(xid)" : p.iss && String(p.iss).includes("r1-local-issuer") ? "signed-in(OIDC)" : "participant-token(other)";
        } catch {
          kind = "unparsable";
        }
      }
      auth.push(`${r.method()} ${new URL(r.url()).pathname} ${kind}`);
    });
    await open(page, { conversation_id: a, xid, reset: true });
    const v = await tryVote(page);
    note("observed", { vote: v, underXid: xidParticipants(a, xid), signedInAccountBefore: before, signedInAccountAfter: uidParticipants(a, uidC), authSent: auth });
    expect(v.status).toBe(200);
  });
});

test.describe("R2/R3 proposal: headers NTARI's proxy could add to Pol.is pages", () => {
  // Simulated with page.route (adds a response header to the conversation page),
  // standing in for an nginx add_header on NTARI's proxy. Not an upstream change.
  const withCsp = async (page: Page, convId: string, csp: string) =>
    page.route(new RegExp(`^${POLIS_URL}/${convId}\\?`), async (route) => {
      const resp = await route.fetch();
      await route.fulfill({ response: resp, headers: { ...resp.headers(), "content-security-policy": csp } });
    });

  test("W9 CSP frame-ancestors as a browser-enforced domain lock", async ({ page, browser }) => {
    const a = conv("A");
    const [x1, x2] = [randomXid(), randomXid()];
    await admit(a, [x1, x2]);
    await withCsp(page, a, "frame-ancestors http://localhost:8190");
    await open(page, { conversation_id: a, xid: x1 });
    const on = await tryVote(page);
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await withCsp(page2, a, "frame-ancestors http://localhost:8190");
    await open(page2, { conversation_id: a, xid: x2 }, "http://127.0.0.1:8190/embed-r2.html");
    const off = await tryVote(page2);
    await ctx2.close();
    note("observed", { approvedSite: on, otherSite: off, otherSiteParticipants: xidParticipants(a, x2) });
    expect(on.status).toBe(200);
    expect(off.status).toBeNull();
    expect(xidParticipants(a, x2)).toHaveLength(0);
  });

  test("W10 CSP that stops the participation page calling third parties", async ({ page }) => {
    const a = conv("A");
    const xid = randomXid();
    await admit(a, [xid]);
    // Count only requests that actually completed (Chromium also reports
    // CSP-blocked requests as "request" events, then fails them).
    const external: string[] = [];
    page.on("requestfinished", (r) => {
      const u = new URL(r.url());
      if (!["localhost", "127.0.0.1"].includes(u.hostname)) external.push(u.host);
    });
    const violations: string[] = [];
    page.on("console", (m) => {
      if (/Content.Security.Policy|Refused to/i.test(m.text())) violations.push(m.text().slice(0, 160));
    });
    await withCsp(page, a, "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors http://localhost:8190");
    await open(page, { conversation_id: a, xid });
    const v = await tryVote(page);
    note("observed", { vote: v, externalRequestsSent: [...new Set(external)], cspConsoleMessages: violations.slice(0, 6) });
    expect(v.status).toBe(200);
    expect(external).toHaveLength(0);
  });
});
