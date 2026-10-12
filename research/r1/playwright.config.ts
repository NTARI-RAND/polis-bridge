// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  // Fresh conversations for every run (tools/setup-conversations.mjs).
  globalSetup: "./tests/global-setup.ts",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  // One worker: the checks compare participant counts in shared conversations.
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  use: {
    // The host page origin. Same registrable site as Pol.is (localhost), as in PLAN.md §3.
    baseURL: "http://localhost:8190",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    // Firefox through a Playwright server in Docker, for hosts where the local
    // Firefox build cannot start (on the R1 machine Windows Smart App Control
    // blocks it). Start the server (README.md) and set PW_REMOTE_WS. The
    // browser's localhost traffic is tunnelled back to this machine.
    ...(process.env.PW_REMOTE_WS
      ? [
          {
            name: "firefox-docker",
            use: {
              ...devices["Desktop Firefox"],
              connectOptions: { wsEndpoint: process.env.PW_REMOTE_WS, exposeNetwork: "<loopback>" },
            },
          },
        ]
      : []),
  ],
  webServer: {
    command: "node host/server.mjs",
    url: "http://localhost:8190/healthz",
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
