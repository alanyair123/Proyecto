"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { GameMap } from "@/core/types";
import {
  createGameRenderer,
  type GameRenderer,
  type RenderEnemy,
  type RenderPlayer,
} from "@/client/renderer";
import { createInputController, type InputController, type MoveDirection } from "@/client/input";

interface GameSnapshot {
  tick: number;
  floor: number;
  map?: GameMap;
  players: RenderPlayer[];
  enemies: RenderEnemy[];
}

interface GameStartPayload {
  roomId: string;
  seed: number;
  floor: number;
  map: GameMap;
  players: Array<{
    id: string;
    name: string;
    entity: Omit<RenderPlayer, "name" | "alive" | "kills">;
  }>;
  enemies: RenderEnemy[];
}

interface GameOverPayload {
  reason: string;
  floor: number;
  kills: number;
  level: number;
  durationSeconds: number;
}

interface ErrorPayload {
  message?: string;
}

function tokenSubject(token: string): string {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return "";
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64)) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub : "";
  } catch {
    return "";
  }
}

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export default function PlayPage() {
  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const inputRef = useRef<InputController | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const currentSnapshotRef = useRef<GameSnapshot | null>(null);
  const previousSnapshotRef = useRef<GameSnapshot | null>(null);
  const receivedAtRef = useRef(0);
  const localPlayerIdRef = useRef("");
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [fps, setFps] = useState(0);
  const [inputMode, setInputMode] = useState<"touch" | "keyboard">("keyboard");
  const [status, setStatus] = useState<"connecting" | "waiting" | "playing" | "dead" | "error">("connecting");
  const [errorMessage, setErrorMessage] = useState("");
  const [deathSummary, setDeathSummary] = useState<GameOverPayload | null>(null);

  const updateSnapshot = useCallback((next: GameSnapshot) => {
    const previous = currentSnapshotRef.current;
    previousSnapshotRef.current = previous ?? next;
    currentSnapshotRef.current = next;
    receivedAtRef.current = performance.now();
    setSnapshot(next);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const area = areaRef.current;
    if (!canvas || !area) return;

    const renderer = createGameRenderer(canvas, area);
    rendererRef.current = renderer;
    const observer = new ResizeObserver(() => renderer.resize());
    observer.observe(area);

    let animationFrame = 0;
    let frames = 0;
    let lastFpsUpdate = performance.now();
    const draw = (now: number): void => {
      const current = currentSnapshotRef.current;
      if (current) {
        const previous = previousSnapshotRef.current ?? current;
        const currentPlayer = current.players.find((player) => player.id === localPlayerIdRef.current);
        const previousPlayer = previous.players.find((player) => player.id === localPlayerIdRef.current) ?? currentPlayer;
        const progress = Math.min(1, Math.max(0, (now - receivedAtRef.current) / 100));
        const interpolatedPositions = new Map<string, { x: number; y: number }>();
        for (const player of current.players) {
          const prior = previous.players.find((candidate) => candidate.id === player.id);
          interpolatedPositions.set(player.id, prior ? {
            x: prior.pos.x + (player.pos.x - prior.pos.x) * progress,
            y: prior.pos.y + (player.pos.y - prior.pos.y) * progress,
          } : player.pos);
        }
        for (const enemy of current.enemies) {
          const prior = previous.enemies.find((candidate) => candidate.id === enemy.id);
          interpolatedPositions.set(enemy.id, prior ? {
            x: prior.pos.x + (enemy.pos.x - prior.pos.x) * progress,
            y: prior.pos.y + (enemy.pos.y - prior.pos.y) * progress,
          } : enemy.pos);
        }
        let interpolatedPosition = currentPlayer?.pos;
        if (currentPlayer && previousPlayer) {
          interpolatedPosition = {
            x: previousPlayer.pos.x + (currentPlayer.pos.x - previousPlayer.pos.x) * progress,
            y: previousPlayer.pos.y + (currentPlayer.pos.y - previousPlayer.pos.y) * progress,
          };
        }
        renderer.render({
          ...current,
          localPlayerId: localPlayerIdRef.current,
          interpolatedPosition,
          interpolatedPositions,
        });
      }

      frames += 1;
      if (now - lastFpsUpdate >= 500) {
        setFps(Math.round((frames * 1_000) / (now - lastFpsUpdate)));
        frames = 0;
        lastFpsUpdate = now;
      }
      animationFrame = requestAnimationFrame(draw);
    };
    animationFrame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let socket: Socket | undefined;
    let initialized = false;

    async function connect(): Promise<void> {
      try {
        const response = await fetch("/api/socket-token", { cache: "no-store" });
        if (!response.ok) throw new Error("No se pudo obtener el acceso al juego.");
        const body = (await response.json()) as { token?: unknown };
        if (typeof body.token !== "string") throw new Error("El servidor no devolvió un token válido.");
        if (cancelled) return;

        const params = new URLSearchParams(window.location.search);
        const mode = params.get("mode");
        const lobbyId = params.get("lobby");
        const forceTouch = params.get("controls") === "touch";
        const identity = tokenSubject(body.token);
        localPlayerIdRef.current = identity;

        socket = io({ auth: { token: body.token } });
        socketRef.current = socket;
        const input = createInputController(socket, forceTouch);
        inputRef.current = input;
        setInputMode(input.mode);

        socket.on("connect", () => {
          if (initialized) return;
          initialized = true;
          if (mode === "solo") {
            socket?.emit("game:solo", {});
            setStatus("waiting");
          } else if (lobbyId) {
            socket?.emit("lobby:join", { lobbyId });
            socket?.emit("lobby:ready", { ready: true });
            setStatus("waiting");
          } else {
            setStatus("error");
            setErrorMessage("Elige una partida solo o entra desde un lobby.");
          }
        });

        socket.on("lobby:update", () => setStatus((current) => current === "dead" ? current : "waiting"));
        socket.on("game:start", (payload: unknown) => {
          const start = payload as GameStartPayload;
          const initial: GameSnapshot = {
            tick: 0,
            floor: start.floor,
            map: start.map,
            players: start.players.map(({ id, name, entity }) => ({
              ...entity,
              id,
              name,
              alive: true,
              kills: 0,
            })),
            enemies: start.enemies,
          };
          updateSnapshot(initial);
          setStatus("playing");
        });
        socket.on("game:state", (payload: unknown) => {
          const incoming = payload as GameSnapshot;
          const current = currentSnapshotRef.current;
          updateSnapshot({ ...incoming, map: incoming.map ?? current?.map });
        });
        socket.on("game:over", (payload: unknown) => {
          const summary = payload as GameOverPayload;
          setDeathSummary(summary);
          setStatus("dead");
          inputRef.current?.destroy();
          inputRef.current = null;
        });
        socket.on("error", (payload: unknown) => {
          const error = payload as ErrorPayload;
          setErrorMessage(error.message ?? "El servidor rechazó la solicitud.");
          setStatus("error");
        });
        socket.on("connect_error", () => {
          setErrorMessage("No se pudo conectar al servidor del juego.");
          setStatus("error");
        });
      } catch (error: unknown) {
        setErrorMessage(error instanceof Error ? error.message : "No se pudo iniciar el juego.");
        setStatus("error");
      }
    }

    void connect();
    return () => {
      cancelled = true;
      inputRef.current?.destroy();
      inputRef.current = null;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [updateSnapshot]);

  const beginTouch = (direction: MoveDirection, event: React.PointerEvent<HTMLButtonElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    inputRef.current?.startTouch(direction, event.nativeEvent);
  };
  const endTouch = (event: React.PointerEvent<HTMLButtonElement>): void => {
    inputRef.current?.stopTouch(event.pointerId);
  };

  const localPlayer = snapshot?.players.find((player) => player.id === localPlayerIdRef.current);
  const confirmedPosition = localPlayer?.pos;

  return (
    <main className="game-shell">
      <div className="game-area" ref={areaRef}>
        <canvas ref={canvasRef} aria-label="Mapa del juego" />
      </div>

      <output className="fps-counter" data-testid="fps" aria-label="Cuadros por segundo">
        {fps} FPS
      </output>
      {confirmedPosition && (
        <div
          data-testid="player-pos"
          data-x={confirmedPosition.x}
          data-y={confirmedPosition.y}
          className="visually-hidden"
        />
      )}

      {inputMode === "touch" && status === "playing" && (
        <div className="dpad" aria-label="Controles de movimiento">
          <button
            className="dpad-up"
            aria-label="Arriba"
            onPointerDown={(event) => beginTouch("up", event)}
            onPointerUp={endTouch}
            onPointerCancel={endTouch}
            onLostPointerCapture={endTouch}
          >↑</button>
          <button
            className="dpad-left"
            aria-label="Izquierda"
            onPointerDown={(event) => beginTouch("left", event)}
            onPointerUp={endTouch}
            onPointerCancel={endTouch}
            onLostPointerCapture={endTouch}
          >←</button>
          <button
            className="dpad-down"
            aria-label="Abajo"
            onPointerDown={(event) => beginTouch("down", event)}
            onPointerUp={endTouch}
            onPointerCancel={endTouch}
            onLostPointerCapture={endTouch}
          >↓</button>
          <button
            className="dpad-right"
            aria-label="Derecha"
            onPointerDown={(event) => beginTouch("right", event)}
            onPointerUp={endTouch}
            onPointerCancel={endTouch}
            onLostPointerCapture={endTouch}
          >→</button>
        </div>
      )}

      {(status === "connecting" || status === "waiting") && (
        <div className="status-card" role="status">
          {status === "connecting" ? "Conectando…" : "Esperando al servidor…"}
        </div>
      )}
      {status === "error" && <div className="status-card error-card" role="alert">{errorMessage}</div>}
      {status === "dead" && deathSummary && (
        <section className="death-card" aria-labelledby="death-title">
          <h1 id="death-title">Fin de la partida</h1>
          <p>Nivel alcanzado: {deathSummary.floor}</p>
          <p>Enemigos eliminados: {deathSummary.kills}</p>
          <p>Tiempo: {formatDuration(deathSummary.durationSeconds)}</p>
          <button type="button" onClick={() => { window.location.href = "/play?mode=solo"; }}>
            Nueva partida
          </button>
        </section>
      )}

      <style jsx>{`
        .game-shell { position: relative; width: 100vw; height: 100vh; height: 100dvh; overflow: hidden; background: #0b0d12; color: #f8fafc; touch-action: none; font-family: system-ui, sans-serif; }
        .game-area { position: absolute; inset: 0; overflow: hidden; touch-action: none; }
        canvas { display: block; touch-action: none; }
        .fps-counter { position: absolute; z-index: 2; top: 12px; right: 12px; border-radius: .35rem; background: rgba(8, 12, 20, .8); padding: .35rem .5rem; font: 12px ui-monospace, monospace; }
        .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
        .dpad { position: absolute; z-index: 3; left: 18px; bottom: max(18px, env(safe-area-inset-bottom)); display: grid; grid-template-columns: repeat(3, 64px); grid-template-rows: repeat(3, 64px); gap: 3px; }
        .dpad button { width: 64px; height: 64px; border: 1px solid rgba(255, 255, 255, .4); border-radius: 16px; background: rgba(30, 41, 59, .58); color: #fff; font-size: 1.8rem; touch-action: none; user-select: none; -webkit-user-select: none; }
        .dpad-up { grid-area: 1 / 2; }.dpad-left { grid-area: 2 / 1; }.dpad-down { grid-area: 2 / 2; }.dpad-right { grid-area: 2 / 3; }
        .status-card, .death-card { position: absolute; z-index: 4; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(88vw, 24rem); border: 1px solid rgba(255, 255, 255, .18); border-radius: 1rem; background: rgba(15, 23, 42, .95); padding: 1.5rem; text-align: center; box-shadow: 0 1rem 3rem rgba(0, 0, 0, .35); }
        .error-card { color: #fecaca; }
        .death-card h1 { margin: 0 0 1rem; }.death-card p { margin: .5rem 0; }
        .death-card button { margin-top: 1rem; min-height: 48px; border: 0; border-radius: .55rem; background: #0891b2; color: white; padding: .7rem 1.2rem; font: inherit; font-weight: 650; }
      `}</style>
    </main>
  );
}
