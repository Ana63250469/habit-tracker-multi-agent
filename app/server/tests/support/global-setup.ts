import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { TEST_ENV } from "../../vitest.config";

// Runs once before all tests: recreate the test database from the migrations.
export default function setup() {
  const serverDir = path.resolve(__dirname, "../..");
  for (const file of ["prisma/test.db", "prisma/test.db-journal"]) {
    rmSync(path.join(serverDir, file), { force: true });
  }
  execSync("npx prisma migrate deploy", {
    cwd: serverDir,
    env: { ...process.env, ...TEST_ENV },
    stdio: "pipe",
  });
}
