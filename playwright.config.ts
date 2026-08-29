import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  workers: 1,
  retries: 0,
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    {
      name: "tablet",
      use: {
        viewport: { width: 1180, height: 820 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev -- --port 3100",
    env: {
      ...process.env,
      DAIRY_NEXT_DIST_DIR: ".next-e2e",
      NEXT_PUBLIC_DAIRY_OFFLINE: "true",
      MONGODB_URI: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/?directConnection=true",
      MONGODB_DB: "dairy_e2e",
    },
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
