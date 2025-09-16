// src/services/gameService.ts
import { prisma } from "./prismaService";
import { GameStatus } from "@prisma/client";
import { NotFoundError, ValidationError } from "./errors";
import { generateAccessCode } from "./utils";

async function uniqueAccessCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = generateAccessCode(6);
    const exists = await prisma.game.findUnique({
      where: { accessCode: code },
    });
    if (!exists) return code;
  }
  throw new Error("Could not generate unique access code.");
}

export const GameService = {
  // setters
  async create(
    userId: number,
    gameConfigurationId: number,
    accessCode?: string
  ) {
    const code = accessCode ?? (await uniqueAccessCode());
    return prisma.game.create({
      data: { userId, gameConfigurationId, accessCode: code },
    });
  },

  async setStatus(id: number, status: GameStatus) {
    // GameStatus is already a strict enum
    const valid: GameStatus[] = [
      GameStatus.PENDING,
      GameStatus.ACTIVE,
      GameStatus.COMPLETED,
      GameStatus.CANCELLED,
    ];

    if (!valid.includes(status)) {
      throw new ValidationError(`Invalid status: ${status}`);
    }

    return prisma.game.update({
      where: { id },
      data: { status },
    });
  },

  async remove(id: number) {
    return prisma.game.delete({ where: { id } });
  },

  // getters
  async byId(id: number, withRelations = false) {
    const game = await prisma.game.findUnique({
      where: { id },
      include: withRelations
        ? { user: true, gameConfiguration: true }
        : undefined,
    });
    if (!game) throw new NotFoundError("Game", { id });
    return game;
  },

  async byAccessCode(accessCode: string) {
    const game = await prisma.game.findUnique({ where: { accessCode } });
    if (!game) throw new NotFoundError("Game", { accessCode });
    return game;
  },

  async byUser(userId: number) {
    return prisma.game.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },

  async byConfig(gameConfigurationId: number) {
    return prisma.game.findMany({
      where: { gameConfigurationId },
      orderBy: { createdAt: "desc" },
    });
  },

  async all() {
    return prisma.game.findMany({ orderBy: { id: "asc" } });
  },
};
