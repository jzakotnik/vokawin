// src/services/vocabularyEntryService.ts
import { prisma } from "./prismaService";
import { NotFoundError } from "./errors";

export const VocabularyEntryService = {
  // getters
  async byId(id: number) {
    const entry = await prisma.vocabularyEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundError("VocabularyEntry", { id });
    return entry;
  },

  async byListAndPosition(vocabularyListId: number, position: number) {
    const entry = await prisma.vocabularyEntry.findUnique({
      where: { vocabularyListId_position: { vocabularyListId, position } },
    });
    if (!entry)
      throw new NotFoundError("VocabularyEntry", {
        vocabularyListId,
        position,
      });
    return entry;
  },

  async allForList(vocabularyListId: number) {
    return prisma.vocabularyEntry.findMany({
      where: { vocabularyListId },
      orderBy: { position: "asc" },
    });
  },

  // setters
  async update(
    id: number,
    data: { sourceWord?: string; targetWord?: string; position?: number }
  ) {
    return prisma.vocabularyEntry.update({ where: { id }, data });
  },

  async moveWithinList(id: number, newPosition: number) {
    return prisma.vocabularyEntry.update({
      where: { id },
      data: { position: newPosition },
    });
  },

  async remove(id: number) {
    return prisma.vocabularyEntry.delete({ where: { id } });
  },
};
