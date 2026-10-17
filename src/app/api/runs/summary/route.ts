import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "No autorizado" }, { status: 401 });

  const summary = await prisma.gameRun.aggregate({
    _count: { _all: true },
    _max: { levelReached: true },
    _avg: { enemiesKilled: true },
  });

  return Response.json({
    totalRuns: summary._count._all,
    maxLevel: summary._max.levelReached ?? 0,
    averageEnemiesKilled: summary._avg.enemiesKilled ?? 0,
  });
}
