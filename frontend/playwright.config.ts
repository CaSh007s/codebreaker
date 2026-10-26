import { defineConfig } from "@playwright/test";

// Run against a local frontend and backend with a dedicated test Redis instance.
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://localhost:13000",
    trace: "retain-on-failure",
  },
});
