import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  workers: 1,
  retries: 0,
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev -- --port 3100",
    env: {
      ...process.env,
      DAIRY_DATABASE_PATH: path.join(process.cwd(), ".tmp", "e2e.sqlite"),
      DAIRY_BACKUP_PATH: path.join(process.cwd(), ".tmp", "backups"),
    },
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
