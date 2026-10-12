// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig, devices } from "@playwright/test";

// Light by design (the R1 run slowed the maintainer's PC): one worker,
// Chromium and WebKit only, no traces or videos.
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/global-setup.ts",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: ".local/results.json" }]],
  use: { baseURL: "http://localhost:8190", trace: "off", video: "off", screenshot: "off" },
  projects: [
    { name: "api", testMatch: /api\.spec\.ts/ },
    { name: "chromium", testMatch: /browser\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", testMatch: /browser\.spec\.ts/, use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "node host/server.mjs",
    url: "http://localhost:8190/healthz",
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
