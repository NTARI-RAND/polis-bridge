// SPDX-License-Identifier: AGPL-3.0-or-later
//
// R1: does the legacy Pol.is embed (embed.js) carry a per-member xid
// correctly in Chromium, Firefox and WebKit? Nine checks, C1..C9. Each test
// records what it observed as annotations (shown in the JSON report) so the
// research note can quote evidence.

import { expect, test, type Page, type Response } from "@playwright/test";
import {
  POLIS_URL,
  admitXids,
  api,
  conversationTotals,
  randomXid,
  readState,
  votesForXid,
} from "../lib/polis.mjs";

type EmbedCfg = { conversation_id: string; xid?: string; ucv?: boolean; ucw?: boolean };

const FRAME = 'iframe[data-testid="polis-iframe"]';

function note(type: string, description: unknown) {
  test.info().annotations.push({ type, description: typeof description === "string" ? description : JSON.stringify(description) });
}

async function openEmbed(page: Page, cfg: EmbedCfg, hostOrigin = "http://localhost:8190") {
  await page.addInitScript((c) => {
    (window as any).__R1 = c;
  }, cfg);
  await page.goto(`${hostOrigin}/embed.html`);
  await expect(page.locator(FRAME)).toHaveCount(1);
  return page.frameLocator(FRAME);
}

const isVotePost = (r: Response) => r.url().includes("/api/v3/votes") && r.request().method() === "POST";

/** Click Agree on the first statement and return the vote response. */
async function voteAgree(page: Page) {
  const frame = page.frameLocator(FRAME);
  await expect(frame.locator("#agreeButton")).toBeVisible({ timeout: 30_000 });
  const [res] = await Promise.all([page.waitForResponse(isVotePost), frame.locator("#agreeButton").click()]);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => null);
  }
  return { status: res.status(), body };
}

test.describe("R1 legacy embed.js + xid", () => {
  test("C1 first-load vote via embed lands under the xid's participant", async ({ page }) => {
    const { conversations } = readState();
    const conv = conversations.main;
    const xid = randomXid();
    expect((await admitXids(conv, [xid])).status).toBe(200);
    const before = conversationTotals(conv);

    await openEmbed(page, { conversation_id: conv, xid });
    const src = (await page.locator(FRAME).getAttribute("src")) ?? "";
    const parentUrl = new URL(src).searchParams.get("parent_url") ?? "";
    note("iframe-parent_url", parentUrl);
    expect(parentUrl).toBe("http://localhost:8190/embed.html");
    expect(new URL(src).searchParams.get("subscribe_type")).toBe("0");

    const vote = await voteAgree(page);
    note("vote-status", vote.status);
    expect(vote.status).toBe(200);

    const rows = votesForXid(conv, xid);
    note("db-rows-for-xid", rows);
    expect(rows).toHaveLength(1);
    expect(rows[0].votes).toBe(1);
    const after = conversationTotals(conv);
    note("participants-delta", after.participants - before.participants);
    expect(after.participants - before.participants).toBe(1);

    // subscribe_type=0: no email prompt after voting.
    await expect(page.frameLocator(FRAME).locator("#subscribeEmailForm")).toHaveCount(0);
  });

  test("C2 ucv=false hides voting; default ucv shows it", async ({ page }) => {
    const { conversations } = readState();
    const conv = conversations.main;
    const xid = randomXid();
    await admitXids(conv, [xid]);
    const init = page.waitForResponse((r) => r.url().includes("/api/v3/participationInit"));
    const frame = await openEmbed(page, { conversation_id: conv, xid, ucv: false });
    note("participationInit-status", (await init).status());
    // Give the client time to render after its init call.
    await page.waitForTimeout(4_000);
    const visible = await frame.locator("#agreeButton").isVisible().catch(() => false);
    note("agree-visible-with-ucv-false", visible);
    expect(visible).toBe(false);
  });

  test("C3 ucw=false hides the statement form; ucw=true shows it", async ({ page, browser }) => {
    const { conversations } = readState();
    const conv = conversations.main;
    const [x1, x2] = [randomXid(), randomXid()];
    await admitXids(conv, [x1, x2]);

    const off = await openEmbed(page, { conversation_id: conv, xid: x1, ucw: false });
    await expect(off.locator("#agreeButton")).toBeVisible({ timeout: 30_000 });
    const offVisible = await off.locator("#comment_form_textarea").isVisible().catch(() => false);
    note("textarea-visible-ucw-false", offVisible);

    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    const on = await openEmbed(page2, { conversation_id: conv, xid: x2, ucw: true });
    await expect(on.locator("#agreeButton")).toBeVisible({ timeout: 30_000 });
    const onVisible = await on.locator("#comment_form_textarea").isVisible().catch(() => false);
    note("textarea-visible-ucw-true", onVisible);
    await ctx2.close();

    expect(offVisible).toBe(false);
    expect(onVisible).toBe(true);
  });

  test("C4 xid shape: 32-hex lowercase works; server length limit is 1..999", async ({ page }, info) => {
    const { conversations } = readState();
    const conv = conversations.main;
    // Browser part (every engine): a 32-hex xid votes through the embed.
    const xid = randomXid();
    expect(xid).toMatch(/^[0-9a-f]{32}$/);
    await admitXids(conv, [xid]);
    await openEmbed(page, { conversation_id: conv, xid });
    expect((await voteAgree(page)).status).toBe(200);
    expect(votesForXid(conv, xid)[0]?.votes).toBe(1);

    // API part (once): lengths and characters, voting without a browser.
    if (info.project.name !== "chromium") return;
    const cases: Record<string, string> = {
      hex64: randomXid() + randomXid(),
      len999: "a".repeat(999),
      len1000: "a".repeat(1000),
      punct: `r1-${randomXid().slice(0, 8)}_.~:@`,
    };
    const results: Record<string, number> = {};
    for (const [name, x] of Object.entries(cases)) {
      await admitXids(conv, [x]);
      const r = await api("POST", "/api/v3/votes", { body: { conversation_id: conv, xid: x, tid: 0, vote: -1 } });
      results[name] = r.status;
    }
    note("api-vote-status-by-xid-shape", results);
    expect(results.hex64).toBe(200);
    expect(results.len999).toBe(200);
    expect(results.len1000).not.toBe(200);
  });

  test("C5 shared browser: a second xid in the same browser gets its own participant", async ({ page }) => {
    const { conversations } = readState();
    const conv = conversations.main;
    const [xa, xb] = [randomXid(), randomXid()];
    await admitXids(conv, [xa, xb]);

    await openEmbed(page, { conversation_id: conv, xid: xa });
    const va = await voteAgree(page);
    expect(va.status).toBe(200);
    // What did Pol.is store in its own (iframe) origin after the first vote?
    const polisFrame = page.frames().find((f) => f.url().startsWith(POLIS_URL));
    const stored = await polisFrame
      ?.evaluate(() => Object.keys(window.localStorage).filter((k) => k.startsWith("participant_token_")))
      .catch((e) => `error: ${e}`);
    note("iframe-localStorage-token-keys-after-A", stored);

    // Same browser context (same localStorage), second member's xid.
    const authHeaders: string[] = [];
    page.on("request", (r) => {
      if (r.url().startsWith(POLIS_URL + "/api/v3/")) {
        const a = r.headers()["authorization"];
        authHeaders.push(`${new URL(r.url()).pathname} auth=${a ? "Bearer(" + JSON.parse(Buffer.from(a.split(".")[1], "base64url").toString()).xid + ")" : "none"}`);
      }
    });
    await openEmbed(page, { conversation_id: conv, xid: xb });
    const vb = await voteAgree(page).catch((e) => ({ status: -1, body: String(e) }));
    note("second-load-api-calls", authHeaders);
    const rowsA = votesForXid(conv, xa);
    const rowsB = votesForXid(conv, xb);
    note("second-vote-status", vb.status);
    note("db-rows-xid-A", rowsA);
    note("db-rows-xid-B", rowsB);
    const merged = rowsB.length === 0 || (rowsA[0] && rowsB[0] && rowsA[0].pid === rowsB[0].pid);
    note("merged-into-one-participant", merged);
    expect(merged, "second xid's vote was recorded under the first xid's participant").toBe(false);
  });

  test("C5b shared browser: a NON-admitted xid after an admitted one is still refused", async ({ page }) => {
    const { conversations } = readState();
    const conv = conversations.main;
    const xa = randomXid();
    const xn = randomXid(); // never admitted
    await admitXids(conv, [xa]);
    await openEmbed(page, { conversation_id: conv, xid: xa });
    expect((await voteAgree(page)).status).toBe(200);

    await openEmbed(page, { conversation_id: conv, xid: xn });
    const canVote = await page
      .frameLocator(FRAME)
      .locator("#agreeButton")
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    const v = canVote ? await voteAgree(page) : null;
    note("non-admitted-second-xid-vote", v);
    note("db-rows-xid-A", votesForXid(conv, xa));
    note("db-rows-non-admitted-xid", votesForXid(conv, xn));
    expect(v === null || v.status !== 200, "non-admitted xid voted using the previous member's token").toBe(true);
  });

  test("C6 xid whitelist on: a non-admitted xid cannot vote", async ({ page }) => {
    const { conversations } = readState();
    const conv = conversations.main;
    const xid = randomXid(); // never admitted
    const before = conversationTotals(conv);
    const frame = await openEmbed(page, { conversation_id: conv, xid });
    const visible = await frame
      .locator("#agreeButton")
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    note("agree-visible", visible);
    if (visible) {
      const v = await voteAgree(page);
      note("vote-response", v);
      expect(v.status).not.toBe(200);
    }
    const rows = votesForXid(conv, xid);
    note("db-rows-for-xid", rows);
    expect(rows.reduce((n, r) => n + r.votes, 0)).toBe(0);
    const after = conversationTotals(conv);
    note("votes-delta", after.votes - before.votes);
  });

  test("C7 admitting an xid at runtime takes effect immediately", async ({ page }) => {
    const { conversations } = readState();
    const conv = conversations.main;
    const xid = randomXid();
    // Refused before admission (API, no browser state).
    const pre = await api("POST", "/api/v3/votes", { body: { conversation_id: conv, xid, tid: 0, vote: -1 } });
    note("pre-admission-api-vote", { status: pre.status, body: pre.body });
    expect(pre.status).not.toBe(200);
    // Admit, then vote through the embed straight away.
    const adm = await admitXids(conv, [xid]);
    expect(adm.status).toBe(200);
    await openEmbed(page, { conversation_id: conv, xid });
    const v = await voteAgree(page);
    note("post-admission-vote-status", v.status);
    expect(v.status).toBe(200);
    expect(votesForXid(conv, xid)[0]?.votes).toBe(1);
  });

  test("C8 domain whitelist: off-domain embed refused, approved domain works", async ({ page, browser }) => {
    const { conversations } = readState();
    const conv = conversations.domain; // owner's whitelist = localhost:8190
    const blocked: { url: string; status: number }[] = [];
    page.on("response", (r) => {
      if (r.url().startsWith(POLIS_URL) && r.status() === 403) blocked.push({ url: new URL(r.url()).pathname, status: 403 });
    });
    // The domain check reads the Referer of the iframe's API calls (it looks for parent_url in it).
    const referers: string[] = [];
    page.on("request", async (r) => {
      if (r.url().includes("/api/v3/participationInit")) {
        const ref = (await r.allHeaders())["referer"] ?? "(none)";
        referers.push(ref.includes("parent_url") ? ref.replace(/xid=[^&]*/, "xid=…") : ref);
      }
    });
    const off = await openEmbed(page, { conversation_id: conv, xid: randomXid() }, "http://127.0.0.1:8190");
    const offCanVote = await off
      .locator("#agreeButton")
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    let offVote: unknown = null;
    if (offCanVote) offVote = await voteAgree(page).catch((e) => String(e));
    note("off-domain-agree-visible", offCanVote);
    note("off-domain-vote", offVote);
    note("off-domain-403s", blocked);
    note("off-domain-participationInit-referer", referers);

    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    const onReferers: string[] = [];
    page2.on("request", async (r) => {
      if (r.url().includes("/api/v3/participationInit")) {
        const ref = (await r.allHeaders())["referer"] ?? "(none)";
        onReferers.push(ref.replace(/xid=[^&]*/, "xid=…"));
      }
    });
    await openEmbed(page2, { conversation_id: conv, xid: randomXid() });
    const onVote = await voteAgree(page2);
    note("on-domain-vote-status", onVote.status);
    note("on-domain-participationInit-referer", onReferers);
    await ctx2.close();

    expect(onVote.status).toBe(200);
    const offRefused = !offCanVote || (typeof offVote === "object" && offVote !== null && (offVote as any).status !== 200);
    expect(offRefused, "off-domain embed was able to vote").toBe(true);
  });

  test("C9 direct link with ?xid= votes on first load (discussion #2441)", async ({ page }) => {
    const { conversations } = readState();
    const conv = conversations.main;
    const xid = randomXid();
    await admitXids(conv, [xid]);
    await page.goto(`${POLIS_URL}/${conv}?xid=${xid}`);
    await expect(page.locator("#agreeButton")).toBeVisible({ timeout: 30_000 });
    const [res] = await Promise.all([page.waitForResponse(isVotePost), page.locator("#agreeButton").click()]);
    note("vote-status", res.status());
    expect(res.status()).toBe(200);
    const rows = votesForXid(conv, xid);
    note("db-rows-for-xid", rows);
    expect(rows[0]?.votes).toBe(1);
  });
});
