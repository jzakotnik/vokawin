// src/services/vocabularyListService.ts
import { prisma } from "./prismaService";
import { NotFoundError, ValidationError } from "./errors";

export const VocabularyListService = {
  // setters
  async create(source: string, sourceLang: string, targetLang: string) {
    return prisma.vocabularyList.create({
      data: { source, sourceLang, targetLang },
    });
  },

  async update(
    id: number,
    data: Partial<{ source: string; sourceLang: string; targetLang: string }>
  ) {
    return prisma.vocabularyList.update({ where: { id }, data });
  },

  async remove(id: number) {
    // Entries cascade via schema
    return prisma.vocabularyList.delete({ where: { id } });
  },

  // getters
  async byId(id: number, withRelations = false) {
    const list = await prisma.vocabularyList.findUnique({
      where: { id },
      include: withRelations
        ? {
            entries: { orderBy: { position: "asc" } },
            gameConfigurations: true,
          }
        : undefined,
    });
    if (!list) throw new NotFoundError("VocabularyList", { id });
    return list;
  },

  async all(filter?: { sourceLang?: string; targetLang?: string }) {
    return prisma.vocabularyList.findMany({
      where: {
        sourceLang: filter?.sourceLang,
        targetLang: filter?.targetLang,
      },
      orderBy: { id: "asc" },
    });
  },

  // convenience: entries for a list
  async addEntry(
    vocabularyListId: number,
    position: number,
    sourceWord: string,
    targetWord: string
  ) {
    return prisma.vocabularyEntry.create({
      data: { vocabularyListId, position, sourceWord, targetWord },
    });
  },

  async addEntriesBulk(
    vocabularyListId: number,
    items: Array<{ position: number; sourceWord: string; targetWord: string }>
  ) {
    if (!items.length) return { count: 0 };
    const posSet = new Set(items.map((i) => i.position));
    if (posSet.size !== items.length)
      throw new ValidationError("Duplicate positions in bulk insert.");
    return prisma.vocabularyEntry.createMany({
      data: items.map((i) => ({ vocabularyListId, ...i })),
    });
  },

  async entries(
    vocabularyListId: number,
    opts: { startPosition?: number; endPosition?: number } = {}
  ) {
    return prisma.vocabularyEntry.findMany({
      where: {
        vocabularyListId,
        ...(opts.startPosition !== undefined || opts.endPosition !== undefined
          ? {
              AND: [
                opts.startPosition !== undefined
                  ? { position: { gte: opts.startPosition } }
                  : {},
                opts.endPosition !== undefined
                  ? { position: { lte: opts.endPosition } }
                  : {},
              ],
            }
          : {}),
      },
      orderBy: { position: "asc" },
    });
  },

  async swapEntries(vocabularyListId: number, aPos: number, bPos: number) {
    return prisma.$transaction(async (tx) => {
      const a = await tx.vocabularyEntry.findUnique({
        where: {
          vocabularyListId_position: { vocabularyListId, position: aPos },
        },
      });
      const b = await tx.vocabularyEntry.findUnique({
        where: {
          vocabularyListId_position: { vocabularyListId, position: bPos },
        },
      });
      if (!a || !b)
        throw new NotFoundError("VocabularyEntry (swap)", { aPos, bPos });
      // 3-step swap using temp slot
      await tx.vocabularyEntry.update({
        where: { id: a.id },
        data: { position: -1 },
      });
      await tx.vocabularyEntry.update({
        where: { id: b.id },
        data: { position: aPos },
      });
      await tx.vocabularyEntry.update({
        where: { id: a.id },
        data: { position: bPos },
      });
      return { aId: a.id, bId: b.id };
    });
  },
};
