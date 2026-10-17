"use client";

import { useEffect, useState } from "react";

interface RunItem {
  id: string;
  endedAt: string;
  levelReached: number;
  enemiesKilled: number;
  durationSeconds: number;
  inventory: unknown;
  user: { name: string | null };
}

interface RunsResponse {
  items: RunItem[];
  nextCursor: string | null;
}

interface Summary {
  totalRuns: number;
  maxLevel: number;
  averageEnemiesKilled: number;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes} min ${remainder} s` : `${remainder} s`;
}

function summarizeInventory(inventory: unknown): string {
  if (!Array.isArray(inventory) || inventory.length === 0) return "Vacío";
  const itemCount = inventory.reduce((total, item: unknown) => {
    if (!item || typeof item !== "object" || !("qty" in item)) return total;
    const qty = item.qty;
    return total + (typeof qty === "number" && Number.isFinite(qty) ? qty : 0);
  }, 0);
  return `${itemCount} ${itemCount === 1 ? "objeto" : "objetos"}`;
}

function timingDuration(header: string | null): number | null {
  const match = header?.match(/(?:^|,\s*)db;dur=([\d.]+)/);
  return match ? Number(match[1]) : null;
}

export default function StatsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [items, setItems] = useState<RunItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([]);
  const [mineOnly, setMineOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [queryMs, setQueryMs] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/runs/summary", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudo cargar el resumen.");
        setSummary((await response.json()) as Summary);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Error al cargar el resumen.");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: "20" });
    if (cursor) params.set("cursor", cursor);
    if (mineOnly) params.set("mine", "true");

    setLoading(true);
    setError("");
    void fetch(`/api/runs?${params.toString()}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        setQueryMs(timingDuration(response.headers.get("Server-Timing")));
        if (!response.ok) throw new Error("No se pudieron cargar las partidas.");
        const result = (await response.json()) as RunsResponse;
        setItems(result.items);
        setNextCursor(result.nextCursor);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Error al cargar las partidas.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [cursor, mineOnly]);

  function goToNextPage(): void {
    if (!nextCursor) return;
    setCursorStack((current) => [...current, cursor]);
    setCursor(nextCursor);
  }

  function goToPreviousPage(): void {
    if (cursorStack.length === 0) return;
    const previous = cursorStack[cursorStack.length - 1] ?? null;
    setCursorStack((current) => current.slice(0, -1));
    setCursor(previous);
  }

  function changeMineFilter(): void {
    setMineOnly((current) => !current);
    setCursor(null);
    setNextCursor(null);
    setCursorStack([]);
  }

  return (
    <main className="stats-page">
      <header className="page-header">
        <a href="/">← Inicio</a>
        <div>
          <p className="eyebrow">PulseMarket</p>
          <h1>Estadísticas</h1>
        </div>
        <span className="timing" data-testid="queryms">
          {queryMs === null ? "Consulta: —" : `Consulta: ${queryMs.toFixed(2)} ms`}
        </span>
      </header>

      <section className="summary-grid" aria-label="Resumen de partidas">
        <article className="summary-card">
          <span>Total de partidas</span>
          {summary ? <strong>{summary.totalRuns.toLocaleString("es-MX")}</strong> : <div className="skeleton summary-skeleton" />}
        </article>
        <article className="summary-card">
          <span>Nivel máximo</span>
          {summary ? <strong>{summary.maxLevel}</strong> : <div className="skeleton summary-skeleton" />}
        </article>
        <article className="summary-card">
          <span>Promedio de enemigos</span>
          {summary ? <strong>{summary.averageEnemiesKilled.toFixed(1)}</strong> : <div className="skeleton summary-skeleton" />}
        </article>
      </section>

      <section className="runs-section" aria-labelledby="runs-title">
        <div className="runs-heading">
          <div>
            <p className="eyebrow">Registro de actividad</p>
            <h2 id="runs-title">Partidas recientes</h2>
          </div>
          <label className="mine-filter">
            <input type="checkbox" checked={mineOnly} onChange={changeMineFilter} />
            Solo mis partidas
          </label>
        </div>

        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Jugador</th>
                <th>Nivel</th>
                <th>Enemigos</th>
                <th>Duración</th>
                <th>Fecha</th>
                <th>Inventario</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 6 }, (_, index) => (
                <tr key={`skeleton-${index}`} aria-hidden="true">
                  {Array.from({ length: 6 }, (_, cell) => <td key={cell}><div className="skeleton row-skeleton" /></td>)}
                </tr>
              )) : items.map((item) => (
                <tr key={item.id}>
                  <td>{item.user.name ?? "Anónimo"}</td>
                  <td>{item.levelReached}</td>
                  <td>{item.enemiesKilled}</td>
                  <td>{formatDuration(item.durationSeconds)}</td>
                  <td><time dateTime={item.endedAt}>{new Date(item.endedAt).toLocaleString("es-MX")}</time></td>
                  <td>{summarizeInventory(item.inventory)}</td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr><td className="empty-row" colSpan={6}>Todavía no hay partidas para mostrar.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <nav className="pagination" aria-label="Paginación de partidas">
          <button type="button" onClick={goToPreviousPage} disabled={loading || cursorStack.length === 0}>Anterior</button>
          <span>Página {cursorStack.length + 1}</span>
          <button type="button" onClick={goToNextPage} disabled={loading || !nextCursor}>Siguiente</button>
        </nav>
      </section>

      <style jsx>{`
        .stats-page { min-height: 100vh; background: #f4f6fb; color: #172033; padding: clamp(1rem, 4vw, 3rem); font-family: system-ui, sans-serif; }
        .page-header, .runs-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
        .page-header { max-width: 75rem; margin: 0 auto 1.5rem; }
        .page-header a { color: #4338ca; font-weight: 650; text-decoration: none; }
        .page-header h1 { margin: 0; font-size: clamp(2rem, 5vw, 3rem); }
        .eyebrow { margin: 0 0 .25rem; color: #6366a8; font-size: .75rem; font-weight: 750; letter-spacing: .12em; text-transform: uppercase; }
        .timing { border-radius: 999px; background: #e8e9fb; color: #3730a3; padding: .55rem .85rem; font: 600 .82rem ui-monospace, monospace; white-space: nowrap; }
        .summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; max-width: 75rem; margin: 0 auto 1.25rem; }
        .summary-card, .runs-section { border: 1px solid #e1e5ef; border-radius: 1rem; background: #fff; box-shadow: 0 12px 32px rgba(25, 35, 70, .05); }
        .summary-card { display: grid; gap: .65rem; padding: 1.25rem; color: #606a80; }
        .summary-card strong { color: #172033; font-size: 1.9rem; }
        .runs-section { max-width: 75rem; margin: auto; padding: clamp(1rem, 3vw, 1.5rem); }
        .runs-heading { margin-bottom: 1.25rem; }
        h2 { margin: 0; font-size: 1.45rem; }
        .mine-filter { display: flex; align-items: center; gap: .5rem; color: #4b5568; font-weight: 600; }
        .mine-filter input { width: 1.1rem; height: 1.1rem; accent-color: #4338ca; }
        .table-scroll { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; text-align: left; white-space: nowrap; }
        th { background: #f6f7fb; color: #596177; font-size: .78rem; letter-spacing: .04em; text-transform: uppercase; }
        th, td { border-bottom: 1px solid #e8eaf1; padding: .85rem .75rem; }
        td { font-size: .92rem; }
        .empty-row { padding: 2rem; color: #687086; text-align: center; }
        .pagination { display: flex; align-items: center; justify-content: center; gap: 1.1rem; padding-top: 1.25rem; }
        button { min-height: 48px; min-width: 112px; border: 0; border-radius: .65rem; background: #4338ca; color: white; cursor: pointer; padding: .7rem 1rem; font: inherit; font-weight: 700; }
        button:disabled { cursor: not-allowed; opacity: .45; }
        .skeleton { border-radius: .4rem; background: linear-gradient(90deg, #eceef4 25%, #f7f8fb 50%, #eceef4 75%); background-size: 200% 100%; animation: shimmer 1.2s infinite; }
        .summary-skeleton { width: 45%; height: 2rem; }.row-skeleton { width: 6rem; height: 1rem; }
        .error-message { border-radius: .6rem; background: #fee2e2; color: #991b1b; padding: .75rem; }
        @keyframes shimmer { to { background-position: -200% 0; } }
        @media (max-width: 650px) {
          .page-header { flex-wrap: wrap; }
          .page-header > div { order: -1; width: 100%; }
          .summary-grid { grid-template-columns: 1fr; }
          .summary-card { padding: 1rem; }
          .runs-heading { align-items: flex-start; flex-direction: column; }
          .pagination { gap: .6rem; }
          button { min-width: 96px; }
        }
      `}</style>
    </main>
  );
}
