import type { Prisma as GcP } from "@prisma/client";
import { prisma as gcDb } from "@/lib/prisma";

export async function getGameConfigurationById(id: number) {
  return gcDb.gameConfiguration.findUnique({ where: { id } });
}

export async function listGameConfigurations(
  params: GcP.GameConfigurationFindManyArgs = {}
) {
  return gcDb.gameConfiguration.findMany(params);
}

export async function createGameConfiguration(
  data: GcP.GameConfigurationCreateInput
) {
  return gcDb.gameConfiguration.create({ data });
}

export async function updateGameConfiguration(
  where: GcP.GameConfigurationWhereUniqueInput,
  data: GcP.GameConfigurationUpdateInput
) {
  return gcDb.gameConfiguration.update({ where, data });
}

export async function deleteGameConfiguration(
  where: GcP.GameConfigurationWhereUniqueInput
) {
  return gcDb.gameConfiguration.delete({ where });
}

export async function countGameConfigurations(
  where?: GcP.GameConfigurationWhereInput
) {
  return gcDb.gameConfiguration.count({ where });
}

// Convenience
export async function listGameConfigurationsByUser(userId: number) {
  return gcDb.gameConfiguration.findMany({ where: { userId } });
}

export async function listGameConfigurationsByVocabulary(vocabularyId: number) {
  return gcDb.gameConfiguration.findMany({ where: { vocabularyId } });
}
