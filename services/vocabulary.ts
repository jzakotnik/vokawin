/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================
// services/vocabulary.ts
// Clear CRUD + TRANSACTIONAL BULK operations
// =============================================

import type { Prisma as P } from "@prisma/client";
import { prisma as db } from "@/lib/prisma";
import { chunk } from "@/lib/chunk";

// ------- CRUD (explicit & readable) -------
export async function getVocabularyById(id: number) {
  return db.vocabulary.findUnique({ where: { id } });
}

export async function listVocabulary(params: P.VocabularyFindManyArgs = {}) {
  return db.vocabulary.findMany(params);
}

export async function createVocabulary(data: P.VocabularyCreateInput) {
  return db.vocabulary.create({ data });
}

export async function updateVocabulary(
  where: P.VocabularyWhereUniqueInput,
  data: P.VocabularyUpdateInput
) {
  return db.vocabulary.update({ where, data });
}

export async function deleteVocabulary(where: P.VocabularyWhereUniqueInput) {
  return db.vocabulary.delete({ where });
}

export async function countVocabulary(where?: P.VocabularyWhereInput) {
  return db.vocabulary.count({ where });
}

export async function bulkUpsertVocabulary(
  items: P.VocabularyCreateInput[],
  toWhereUnique: (
    v: P.VocabularyCreateInput
  ) => P.VocabularyWhereUniqueInput = (v) => ({ id: (v as any).id }),
  opts: { chunkSize?: number } = {}
) {
  if (!items?.length) return { batches: 0, upserts: 0 };
  const { chunkSize = 100 } = opts; // smaller chunks because many statements per tx
  let upserts = 0;
  for (const b of chunk(items, chunkSize)) {
    await db.$transaction(
      b.map((item) =>
        db.vocabulary.upsert({
          where: toWhereUnique(item),
          create: item,
          update: {
            /* map to UpdateInput here */
          },
        })
      )
    );
    upserts += b.length;
  }
  return { batches: Math.ceil(items.length / chunkSize), upserts };
}
