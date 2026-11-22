import { defineConfig } from "vitest/config";

// Test environment for the server. Tests use their own SQLite file (prisma/test.db),
// never the developer database. See tests/support/README.md.
export const TEST_ENV = {
  NODE_ENV: "test",
  DATABASE_URL: "file:./test.db",
  JWT_SECRET: "test-secret-at-least-16-characters",
  JWT_EXPIRES_IN: "1h",
};

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    env: TEST_ENV,
    globalSetup: ["tests/support/global-setup.ts"],
    // One SQLite file is shared by all tests, so run files one after another.
    fileParallelism: false,
    testTimeout: 15000,
  },
});
