import { auth } from "@/auth";
import { RunsQuerySchema } from "@/core/schemas";
import { prisma } from "@/lib/prisma";

function decodeCursor(cursor: string): { endedAt: Date; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf8");
    const separator = decoded.indexOf("_");
    if (separator < 0) return null;
    const endedAt = new Date(decoded.slice(0, separator));
    const id = decoded.slice(separator + 1);
    if (!Number.isFinite(endedAt.getTime()) || !id) return null;
    return { endedAt, id };
  } catch {
    return null;
  }
}

function encodeCursor(endedAt: Date, id: string): string {
  return Buffer.from(`${endedAt.toISOString()}_${id}`, "utf8").toString("base64");
}

export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "No autorizado" }, { status: 401 });

  const url = new URL(request.url);
  const parsed = RunsQuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return Response.json({ error: "Parámetros de consulta inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const cursor = parsed.data.cursor ? decodeCursor(parsed.data.cursor) : null;
  if (parsed.data.cursor && !cursor) {
    return Response.json({ error: "Cursor inválido" }, { status: 400 });
  }

  const where = {
    ...(parsed.data.mine ? { userId } : {}),
    ...(cursor ? {
      OR: [
        { endedAt: { lt: cursor.endedAt } },
        { endedAt: cursor.endedAt, id: { lt: cursor.id } },
      ],
    } : {}),
  };
  const startedAt = performance.now();
  const records = await prisma.gameRun.findMany({
    where,
    orderBy: [{ endedAt: "desc" }, { id: "desc" }],
    take: parsed.data.limit + 1,
    select: {
      id: true,
      endedAt: true,
      levelReached: true,
      enemiesKilled: true,
      durationSeconds: true,
      inventory: true,
      user: { select: { name: true } },
    },
  });
  const queryMs = performance.now() - startedAt;
  const hasNextPage = records.length > parsed.data.limit;
  const items = hasNextPage ? records.slice(0, parsed.data.limit) : records;
  const last = items.at(-1);
  const nextCursor = hasNextPage && last ? encodeCursor(last.endedAt, last.id) : null;

  return Response.json(
    { items, nextCursor },
    { headers: { "Server-Timing": `db;dur=${queryMs.toFixed(2)}` } },
  );
}
