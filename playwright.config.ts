import { defineConfig } from "@playwright/test";
import { loadTestEnvironment } from "./scripts/test-environment.mjs";

loadTestEnvironment();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3041",
    trace: "retain-on-failure",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  },
  projects: [
    {
      name: "mobile",
      use: { browserName: "chromium", viewport: { width: 375, height: 812 } },
    },
    {
      name: "desktop",
      use: { browserName: "chromium", viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3041",
    url: "http://localhost:3041",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      BETTER_AUTH_URL: "http://localhost:3041",
      SMTP_HOST: "",
      SMTP_PORT: "",
      SMTP_FROM: "",
      SMTP_USER: "",
      SMTP_PASSWORD: "",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      MICROSOFT_CLIENT_ID: "",
      MICROSOFT_CLIENT_SECRET: "",
      MICROSOFT_TENANT_ID: "",
    },
  },
});
