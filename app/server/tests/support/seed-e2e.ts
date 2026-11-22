import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

// Seed data for the verifier agent (UI scenarios). Run with DATABASE_URL pointing to the e2e DB.
// User test / test1234; habits Run, Read (active) and Old (archived); no goals, no entries.
const prisma = new PrismaClient();

async function main() {
  const goalTable = await prisma.$queryRawUnsafe<unknown[]>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='Goal'"
  );
  if (goalTable.length > 0) await prisma.$executeRawUnsafe('DELETE FROM "Goal"');
  await prisma.habitEntry.deleteMany();
  await prisma.habit.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.create({ data: { username: "test", passwordHash: await bcrypt.hash("test1234", 10) } });
  await prisma.habit.create({ data: { name: "Run", color: "#22c55e", emoji: "🏃", sortOrder: 0 } });
  await prisma.habit.create({ data: { name: "Read", color: "#6366f1", emoji: "📚", sortOrder: 1 } });
  await prisma.habit.create({ data: { name: "Old", color: "#a1a1aa", sortOrder: 2, archived: true } });
  console.log("e2e seed done");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
