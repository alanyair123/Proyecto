"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { CreateLobbySchema } from "@/core/schemas";

interface LobbyPlayer {
  id: string;
  name: string;
  ready: boolean;
  alive: boolean;
}

interface Lobby {
  id: string;
  name: string;
  maxPlayers: number;
  mode: "solo" | "multi";
  status: "waiting" | "playing" | "finished";
  players: LobbyPlayer[];
}

interface GameStart {
  roomId: string;
}

interface ServerError {
  message?: string;
}

function readSubject(token: string): string {
  try {
    const part = token.split(".")[1];
    if (!part) return "";
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub : "";
  } catch {
    return "";
  }
}

function isLobby(value: unknown): value is Lobby {
  if (!value || typeof value !== "object") return false;
  const lobby = value as Partial<Lobby>;
  return typeof lobby.id === "string" && typeof lobby.name === "string" &&
    typeof lobby.maxPlayers === "number" && (lobby.mode === "solo" || lobby.mode === "multi") &&
    (lobby.status === "waiting" || lobby.status === "playing" || lobby.status === "finished") &&
    Array.isArray(lobby.players) && lobby.players.every((player) =>
      typeof player.id === "string" && typeof player.name === "string" &&
      typeof player.ready === "boolean" && typeof player.alive === "boolean");
}

export default function LobbyPage() {
  const router = useRouter();
  const socketRef = useRef<Socket | null>(null);
  const userIdRef = useRef("");
  const activeLobbyRef = useRef<Lobby | null>(null);
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [activeLobby, setActiveLobby] = useState<Lobby | null>(null);
  const [name, setName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [formError, setFormError] = useState("");
  const [serverError, setServerError] = useState("");
  const [connection, setConnection] = useState("Conectando…");
  const [connected, setConnected] = useState(false);

  const applyLobby = useCallback((lobby: Lobby) => {
    if (lobby.id === activeLobbyRef.current?.id || lobby.players.some((player) => player.id === userIdRef.current)) {
      activeLobbyRef.current = lobby;
      setActiveLobby(lobby);
    }
    setLobbies((current) => {
      const remaining = current.filter((entry) => entry.id !== lobby.id);
      return lobby.status === "waiting" && lobby.mode === "multi"
        ? [...remaining, lobby]
        : remaining;
    });
  }, []);

  const requestLobbies = useCallback(() => {
    socketRef.current?.emit("lobby:list", {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    let socket: Socket | undefined;

    async function connect(): Promise<void> {
      try {
        const response = await fetch("/api/socket-token", { cache: "no-store" });
        if (!response.ok) throw new Error("No se pudo verificar tu sesión.");
        const body = (await response.json()) as { token?: unknown };
        if (typeof body.token !== "string") throw new Error("El servidor no devolvió un token válido.");
        if (cancelled) return;

        userIdRef.current = readSubject(body.token);
        socket = io({ auth: { token: body.token } });
        socketRef.current = socket;
        socket.on("connect", () => {
          setConnected(true);
          setConnection("Conectado");
          socket?.emit("lobby:list", {});
        });
        socket.on("disconnect", () => {
          setConnected(false);
          setConnection("Reconectando…");
        });
        socket.on("lobby:list", (payload: unknown) => {
          if (!Array.isArray(payload)) return;
          const validLobbies = payload.filter(isLobby).filter((lobby) => lobby.status === "waiting");
          setLobbies(validLobbies);
        });
        socket.on("lobby:update", (payload: unknown) => {
          if (isLobby(payload)) applyLobby(payload);
        });
        socket.on("game:start", (payload: unknown) => {
          const start = payload as Partial<GameStart>;
          if (typeof start.roomId === "string") {
            router.push(`/play?lobby=${encodeURIComponent(start.roomId)}`);
          }
        });
        socket.on("error", (payload: unknown) => {
          const error = payload as ServerError;
          setServerError(error.message ?? "El servidor rechazó la solicitud.");
        });
      } catch (error: unknown) {
        setConnection("Sin conexión");
        setServerError(error instanceof Error ? error.message : "No se pudo conectar.");
      }
    }

    void connect();
    const poll = window.setInterval(() => socketRef.current?.emit("lobby:list", {}), 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [applyLobby, router]);

  const myPlayer = activeLobby?.players.find((player) => player.id === userIdRef.current);

  function createLobby(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFormError("");
    setServerError("");
    const parsed = CreateLobbySchema.safeParse({ name: name.trim(), maxPlayers: Number(maxPlayers) });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Revisa los datos de la sala.");
      return;
    }
    socketRef.current?.emit("lobby:create", parsed.data);
  }

  function joinLobby(lobbyId: string): void {
    setServerError("");
    socketRef.current?.emit("lobby:join", { lobbyId });
  }

  function toggleReady(): void {
    if (!myPlayer) return;
    setServerError("");
    socketRef.current?.emit("lobby:ready", { ready: !myPlayer.ready });
  }

  function leaveLobby(): void {
    if (!activeLobby) return;
    socketRef.current?.emit("lobby:leave", { lobbyId: activeLobby.id });
    activeLobbyRef.current = null;
    setActiveLobby(null);
  }

  return (
    <main className="lobby-page">
      <header className="page-header">
        <a className="back-link" href="/">← Inicio</a>
        <div>
          <p className="eyebrow">PulseMarket</p>
          <h1>Lobbies</h1>
        </div>
        <span className={`connection ${connected ? "online" : ""}`} role="status">{connection}</span>
      </header>

      {serverError && <p className="server-error" role="alert">{serverError}</p>}

      {activeLobby ? (
        <section className="room-card" aria-labelledby="room-title">
          <div className="room-heading">
            <div>
              <p className="eyebrow">Sala</p>
              <h2 id="room-title">{activeLobby.name}</h2>
            </div>
            <span className="player-count">{activeLobby.players.length}/{activeLobby.maxPlayers} jugadores</span>
          </div>
          <h3>Jugadores</h3>
          <ul className="player-list">
            {activeLobby.players.map((player) => (
              <li key={player.id}>
                <span>{player.name}{player.id === userIdRef.current ? " (tú)" : ""}</span>
                <span className={player.ready ? "ready" : "not-ready"}>{player.ready ? "Listo" : "No listo"}</span>
              </li>
            ))}
          </ul>
          <p className="my-ready" data-testid="my-ready-status">
            {myPlayer ? (myPlayer.ready ? "Listo" : "No listo") : "Esperando confirmación del servidor…"}
          </p>
          <div className="room-actions">
            <button data-testid="ready-toggle" type="button" onClick={toggleReady} disabled={!myPlayer || !connected}>
              {myPlayer?.ready ? "Marcar como no listo" : "Estoy listo"}
            </button>
            <button className="secondary-button" type="button" onClick={leaveLobby} disabled={!connected}>
              Salir de la sala
            </button>
          </div>
          <p className="helper-text">La partida comienza cuando todos estén listos.</p>
        </section>
      ) : (
        <div className="lobby-content">
          <section className="create-card" aria-labelledby="create-title">
            <p className="eyebrow">Multijugador</p>
            <h2 id="create-title">Crear sala</h2>
            <form onSubmit={createLobby}>
              <label htmlFor="lobby-name">Nombre de la sala</label>
              <input id="lobby-name" name="name" minLength={3} maxLength={24} value={name} onChange={(event) => setName(event.target.value)} required />
              <label htmlFor="lobby-max-players">Máximo de jugadores</label>
              <select id="lobby-max-players" name="maxPlayers" value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))}>
                {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}
              </select>
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <button type="submit" disabled={!connected}>Crear sala</button>
            </form>
          </section>

          <section className="available-section" aria-labelledby="available-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Partidas abiertas</p>
                <h2 id="available-title">Salas disponibles</h2>
              </div>
              <button className="refresh-button" type="button" onClick={requestLobbies} disabled={!connected}>Actualizar</button>
            </div>
            {lobbies.length === 0 ? (
              <p className="empty-state">No hay salas abiertas. Puedes crear una para empezar.</p>
            ) : (
              <ul className="lobby-list">
                {lobbies.map((lobby) => (
                  <li className="lobby-card" key={lobby.id}>
                    <div>
                      <h3>{lobby.name}</h3>
                      <p>{lobby.players.length}/{lobby.maxPlayers} jugadores</p>
                    </div>
                    <button type="button" onClick={() => joinLobby(lobby.id)} disabled={!connected || lobby.players.length >= lobby.maxPlayers}>
                      Unirse
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <style jsx>{`
        .lobby-page { min-height: 100vh; background: #f4f6fb; color: #172033; padding: clamp(1rem, 4vw, 3rem); font-family: system-ui, sans-serif; }
        .page-header, .room-heading, .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
        .page-header { max-width: 72rem; margin: 0 auto 2rem; }
        .page-header h1 { margin: 0; font-size: clamp(2rem, 6vw, 3rem); }
        .eyebrow { margin: 0 0 .25rem; color: #6366a8; font-size: .75rem; font-weight: 750; letter-spacing: .12em; text-transform: uppercase; }
        .back-link { color: #4338ca; font-weight: 650; text-decoration: none; }
        .connection { border-radius: 999px; background: #fee2e2; color: #991b1b; padding: .45rem .75rem; font-size: .85rem; }
        .connection.online { background: #dcfce7; color: #166534; }
        .lobby-content { display: grid; grid-template-columns: minmax(16rem, .85fr) minmax(0, 1.4fr); gap: 1.25rem; max-width: 72rem; margin: auto; align-items: start; }
        .create-card, .available-section, .room-card { border: 1px solid #e1e5ef; border-radius: 1.1rem; background: white; padding: clamp(1rem, 3vw, 1.5rem); box-shadow: 0 12px 32px rgba(25, 35, 70, .06); }
        h2 { margin: 0; font-size: 1.5rem; }
        .create-card form { display: grid; gap: .65rem; margin-top: 1.25rem; }
        label { font-size: .92rem; font-weight: 650; }
        input, select { width: 100%; min-height: 48px; border: 1px solid #cbd2e1; border-radius: .65rem; background: #fff; padding: .7rem .8rem; color: inherit; font: inherit; }
        button { min-height: 54px; border: 0; border-radius: .7rem; background: #4338ca; color: white; cursor: pointer; padding: .8rem 1.1rem; font: inherit; font-weight: 700; }
        button:disabled { cursor: not-allowed; opacity: .55; }
        .create-card form button { margin-top: .5rem; }
        .section-heading { margin-bottom: 1rem; }
        .refresh-button, .secondary-button { border: 1px solid #c7cbe0; background: #fff; color: #34345f; }
        .refresh-button { min-height: 46px; }
        .lobby-list, .player-list { display: grid; gap: .75rem; margin: 0; padding: 0; list-style: none; }
        .lobby-card, .player-list li { display: flex; align-items: center; justify-content: space-between; gap: 1rem; border: 1px solid #e6e8f0; border-radius: .8rem; padding: .85rem; }
        .lobby-card h3, .lobby-card p { margin: 0; }.lobby-card p, .helper-text { color: #687086; font-size: .9rem; }
        .lobby-card button { min-width: 112px; }
        .empty-state { border-radius: .8rem; background: #f6f7fb; padding: 1.25rem; color: #687086; }
        .room-card { max-width: 42rem; margin: 2rem auto; }
        .room-card h3 { margin: 1.6rem 0 .75rem; }
        .player-count { color: #626b80; font-weight: 650; }
        .player-list li { min-height: 58px; }
        .ready { color: #15803d; font-weight: 750; }.not-ready { color: #b45309; font-weight: 700; }
        .my-ready { margin: 1.2rem 0 .7rem; color: #38405a; font-weight: 700; }
        .room-actions { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; }
        .helper-text { margin-bottom: 0; }
        .server-error, .form-error { border-radius: .6rem; background: #fee2e2; color: #991b1b; padding: .75rem; }
        .server-error { max-width: 72rem; margin: 0 auto 1rem; }
        .form-error { margin: .25rem 0; }
        @media (max-width: 700px) {
          .lobby-content { grid-template-columns: 1fr; }
          .page-header { flex-wrap: wrap; }
          .page-header > div { flex: 1; }
          .room-actions { grid-template-columns: 1fr; }
          .lobby-card { align-items: stretch; }
          .lobby-card button { min-width: 100px; }
          .refresh-button { min-width: 100px; }
        }
      `}</style>
    </main>
  );
}
