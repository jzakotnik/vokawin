// src/services/gameConfigService.ts
import { prisma } from "./prismaService";
import { NotFoundError, ValidationError } from "./errors";

async function validateRange(
  vocabularyListId: number,
  startPosition: number,
  endPosition: number
) {
  if (startPosition > endPosition)
    throw new ValidationError("startPosition must be <= endPosition.");
  const maxPos = await prisma.vocabularyEntry.findFirst({
    where: { vocabularyListId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  if (!maxPos) throw new ValidationError("Vocabulary list has no entries.");
  if (startPosition < 0 || endPosition > maxPos.position) {
    throw new ValidationError(
      `Range [${startPosition}, ${endPosition}] is outside list bounds 0..${maxPos.position}.`
    );
  }
}

export const GameConfigService = {
  // setters
  async create(
    userId: number,
    vocabularyListId: number,
    params: { name?: string | null; startPosition: number; endPosition: number }
  ) {
    await validateRange(
      vocabularyListId,
      params.startPosition,
      params.endPosition
    );
    return prisma.gameConfiguration.create({
      data: {
        userId,
        vocabularyListId,
        name: params.name ?? null,
        startPosition: params.startPosition,
        endPosition: params.endPosition,
      },
    });
  },

  async update(
    id: number,
    data: { name?: string | null; startPosition?: number; endPosition?: number }
  ) {
    const cfg = await prisma.gameConfiguration.findUnique({ where: { id } });
    if (!cfg) throw new NotFoundError("GameConfiguration", { id });
    const start = data.startPosition ?? cfg.startPosition;
    const end = data.endPosition ?? cfg.endPosition;
    if (data.startPosition !== undefined || data.endPosition !== undefined) {
      await validateRange(cfg.vocabularyListId, start, end);
    }
    return prisma.gameConfiguration.update({
      where: { id },
      data: { ...data, name: data.name ?? undefined },
    });
  },

  async remove(id: number) {
    return prisma.gameConfiguration.delete({ where: { id } });
  },

  // getters
  async byId(id: number, withRelations = false) {
    const config = await prisma.gameConfiguration.findUnique({
      where: { id },
      include: withRelations
        ? { games: true, vocabularyList: { include: { entries: true } } }
        : undefined,
    });
    if (!config) throw new NotFoundError("GameConfiguration", { id });
    return config;
  },

  async byUser(userId: number) {
    return prisma.gameConfiguration.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },

  async all() {
    return prisma.gameConfiguration.findMany({ orderBy: { id: "asc" } });
  },
};
