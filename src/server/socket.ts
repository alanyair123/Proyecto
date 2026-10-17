import { TextEncoder } from "node:util";
import { jwtVerify } from "jose";
import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { z } from "zod";
import { registerRoomHandlers } from "./rooms";

const HandshakeAuthSchema = z.object({ token: z.string().min(1) }).strict();

interface SocketIdentity {
  id: string;
  name: string;
}

interface SocketData {
  user?: SocketIdentity;
}

export function attachGameSockets(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer);

  io.use(async (socket, next) => {
    const parsed = HandshakeAuthSchema.safeParse(socket.handshake.auth);
    const secret = process.env.AUTH_SECRET;
    if (!parsed.success || !secret) {
      next(new Error("unauthorized"));
      return;
    }

    try {
      const { payload } = await jwtVerify(
        parsed.data.token,
        new TextEncoder().encode(secret),
        { algorithms: ["HS256"] },
      );
      if (typeof payload.sub !== "string" || payload.sub.length === 0) {
        next(new Error("unauthorized"));
        return;
      }

      (socket.data as SocketData).user = {
        id: payload.sub,
        name: typeof payload.name === "string" && payload.name.length > 0 ? payload.name : payload.sub,
      };
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const user = (socket.data as SocketData).user;
    if (user) {
      void socket.join(`user:${user.id}`);
      console.log(`Socket.io conectado: ${socket.id}`);
    }
  });

  registerRoomHandlers(io);
  return io;
}
