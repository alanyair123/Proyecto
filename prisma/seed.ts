import { faker } from "@faker-js/faker";
import { InventorySchema } from "../src/core/schemas";
import { prisma } from "../src/lib/prisma";

const SEED_USER_COUNT = 250;
const GAME_RUN_COUNT = 12_000;
const BATCH_SIZE = 1_000;
const SEED_EMAIL_SUFFIX = "@seed.local";

async function main(): Promise<void> {
  faker.seed(20_261_016);

  const existingSeedUsers = await prisma.user.findMany({
    where: { email: { endsWith: SEED_EMAIL_SUFFIX } },
    select: { id: true },
  });
  const existingSeedUserIds = existingSeedUsers.map(({ id }) => id);

  await prisma.gameRun.deleteMany({
    where: { userId: { in: existingSeedUserIds } },
  });
  await prisma.user.deleteMany({
    where: { email: { endsWith: SEED_EMAIL_SUFFIX } },
  });

  await prisma.user.createMany({
    data: Array.from({ length: SEED_USER_COUNT }, (_, index) => ({
      name: faker.person.fullName(),
      email: `seed-user-${String(index + 1).padStart(3, "0")}${SEED_EMAIL_SUFFIX}`,
      image: faker.image.avatar(),
    })),
  });

  const seedUsers = await prisma.user.findMany({
    where: { email: { endsWith: SEED_EMAIL_SUFFIX } },
    select: { id: true },
    orderBy: { email: "asc" },
  });

  const now = Date.now();
  const ninetyDaysInMs = 90 * 24 * 60 * 60 * 1_000;
  for (let offset = 0; offset < GAME_RUN_COUNT; offset += BATCH_SIZE) {
    const count = Math.min(BATCH_SIZE, GAME_RUN_COUNT - offset);
    const data = Array.from({ length: count }, () => {
      const inventory = InventorySchema.parse(
        Array.from({ length: faker.number.int({ min: 0, max: 6 }) }, () => ({
          itemId: faker.helpers.arrayElement(["potion", "key", "coin", "shield", "torch"]),
          qty: faker.number.int({ min: 1, max: 5 }),
        })),
      );

      return {
        userId: faker.helpers.arrayElement(seedUsers).id,
        seed: faker.number.int({ min: 0, max: 2_147_483_647 }),
        levelReached: faker.number.int({ min: 1, max: 100 }),
        enemiesKilled: faker.number.int({ min: 0, max: 250 }),
        durationSeconds: faker.number.int({ min: 1, max: 86_400 }),
        inventory,
        mode: faker.helpers.arrayElement(["solo", "multi"]),
        endedAt: new Date(now - faker.number.int({ min: 0, max: ninetyDaysInMs })),
      };
    });

    await prisma.gameRun.createMany({ data });
  }

  const [userCount, gameRunCount] = await Promise.all([
    prisma.user.count({ where: { email: { endsWith: SEED_EMAIL_SUFFIX } } }),
    prisma.gameRun.count({
      where: { user: { email: { endsWith: SEED_EMAIL_SUFFIX } } },
    }),
  ]);
  console.log(`Seed terminado: ${userCount} usuarios y ${gameRunCount} partidas.`);
}

main()
  .catch((error: unknown) => {
    console.error("Error al cargar el seed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
