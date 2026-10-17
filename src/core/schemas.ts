import { z } from "zod";

export const ClientInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("move"), dir: z.enum(["up", "down", "left", "right"]) }).strict(),
  z.object({ type: z.literal("wait") }).strict(),
]);

export const CreateLobbySchema = z.object({
  name: z.string().min(3).max(24),
  maxPlayers: z.number().int().min(1).max(4),
});

export const JoinLobbySchema = z.object({ lobbyId: z.string().uuid() });

export const ReadySchema = z.object({ ready: z.boolean() });

export const InventorySchema = z.array(
  z.object({ itemId: z.string(), qty: z.number().int().min(1) }),
).max(20);

export const GameRunSchema = z.object({
  levelReached: z.number().int().min(1).max(100),
  enemiesKilled: z.number().int().min(0),
  durationSeconds: z.number().int().min(1).max(86_400),
  inventory: InventorySchema,
  mode: z.enum(["solo", "multi"]),
});

export const RunsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  mine: z.preprocess(
    (value: unknown) => {
      if (value === "true") return true;
      if (value === "false") return false;
      return value;
    },
    z.coerce.boolean(),
  ).optional(),
});

export type ClientInput = z.infer<typeof ClientInputSchema>;
export type CreateLobby = z.infer<typeof CreateLobbySchema>;
export type JoinLobby = z.infer<typeof JoinLobbySchema>;
export type Ready = z.infer<typeof ReadySchema>;
export type Inventory = z.infer<typeof InventorySchema>;
export type GameRun = z.infer<typeof GameRunSchema>;
export type RunsQuery = z.infer<typeof RunsQuerySchema>;
