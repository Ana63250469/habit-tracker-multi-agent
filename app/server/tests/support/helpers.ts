import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { signToken } from "../../src/lib/jwt";

// Shared test helpers. Human-owned test infrastructure: agents must not change this file.

export const app = createApp();
export const api = () => request(app);

let userId: number | null = null;

/** Empties all tables and creates the single test user (the app requires one user to exist). */
export async function resetDb(): Promise<void> {
  // Goal does not exist before SPEC-001 is implemented, so ignore a missing table.
  const goalTable = await prisma.$queryRawUnsafe<unknown[]>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='Goal'"
  );
  if (goalTable.length > 0) await prisma.$executeRawUnsafe('DELETE FROM "Goal"');
  await prisma.habitEntry.deleteMany();
  await prisma.habit.deleteMany();
  await prisma.user.deleteMany();
  const user = await prisma.user.create({ data: { username: "test", passwordHash: "not-used-in-tests" } });
  userId = user.id;
}

/** Authorization header for the test user. Call resetDb() first. */
export function auth(): { Authorization: string } {
  if (userId === null) throw new Error("Call resetDb() before auth()");
  return { Authorization: `Bearer ${signToken({ userId, username: "test" })}` };
}

/** Creates a habit through the existing API and returns it. */
export async function createHabit(name: string, opts: { archived?: boolean } = {}) {
  const res = await api().post("/api/habits").set(auth()).send({ name, color: "#6366f1" });
  if (res.status !== 201) throw new Error(`createHabit failed: ${res.status} ${JSON.stringify(res.body)}`);
  const habit = res.body.data as { id: string; name: string };
  if (opts.archived) {
    await api().put(`/api/habits/${habit.id}`).set(auth()).send({ archived: true });
  }
  return habit;
}

export { prisma };
