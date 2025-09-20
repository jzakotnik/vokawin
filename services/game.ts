import type { Prisma as GP, GameStatus } from "@prisma/client";
import { prisma as gameDb } from "@/lib/prisma";

export async function getGameById(id: number) {
  return gameDb.game.findUnique({ where: { id } });
}

export async function getGameByAccessCode(accessCode: string) {
  return gameDb.game.findUnique({ where: { accessCode } });
}

export async function listGames(params: GP.GameFindManyArgs = {}) {
  return gameDb.game.findMany(params);
}

export async function createGame(data: GP.GameCreateInput) {
  return gameDb.game.create({ data });
}

export async function updateGame(
  where: GP.GameWhereUniqueInput,
  data: GP.GameUpdateInput
) {
  return gameDb.game.update({ where, data });
}

export async function deleteGame(where: GP.GameWhereUniqueInput) {
  return gameDb.game.delete({ where });
}

export async function countGames(where?: GP.GameWhereInput) {
  return gameDb.game.count({ where });
}

// Helpers
export async function listGamesByUser(userId: number) {
  return gameDb.game.findMany({ where: { userId } });
}

export async function listGamesByConfiguration(gameConfigurationId: number) {
  return gameDb.game.findMany({ where: { gameConfigurationId } });
}

export async function updateGameStatus(id: number, status: GameStatus) {
  return gameDb.game.update({ where: { id }, data: { status } });
}
