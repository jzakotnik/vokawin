// pages/api/vocabulary/import.ts
import type { NextApiRequest, NextApiResponse } from "next";

type Row = { col1?: unknown; col2?: unknown; rowNumber?: number };
type Meta = {
  source: string;
  sourceLang: string;
  targetLang: string;
  comment?: string;
};
type Payload = { meta?: Meta; rows?: Row[] };

export const config = {
  api: { bodyParser: { sizeLimit: "4mb" } }, // bump if needed
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { meta, rows } = (req.body ?? {}) as Payload;

    if (!meta?.source || !meta?.sourceLang || !meta?.targetLang) {
      return res
        .status(400)
        .json({ error: "meta { source, sourceLang, targetLang } is required" });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "rows[] is required" });
    }

    const source = String(meta.source).trim();
    const sourceLang = String(meta.sourceLang).trim();
    const targetLang = String(meta.targetLang).trim();
    const comment = (meta.comment ?? "No comment").trim();

    // Map preview rows -> Prisma CreateInput for YOUR existing Vocabulary model
    const items: P.VocabularyCreateInput[] = rows
      .map((r) => ({
        source,
        sourceLang,
        targetLang,
        sourceWord: String(r.col1 ?? "").trim(),
        targetWord: String(r.col2 ?? "").trim(),
        comment,
        // gameConfigurations left empty; you can link configs later
      }))
      .filter((i) => i.sourceWord.length > 0 || i.targetWord.length > 0);

    if (items.length === 0) {
      return res.status(400).json({ error: "No non-empty rows to import." });
    }

    // ALWAYS-CREATE behavior:
    // Give each item a unique, definitely-nonexistent id as the upsert selector.
    // Because no row has id < 0, Prisma will always take the `create` branch.
    let nonce = -1;
    const toWhereUnique = (_v: P.VocabularyCreateInput) => ({ id: nonce-- });

    const result = await bulkUpsertVocabulary(items, toWhereUnique, {
      chunkSize: 100,
    });

    return res.status(200).json({
      ok: true,
      ...result, // { batches, upserts }
      received: rows.length,
      created: result.upserts,
      meta: { source, sourceLang, targetLang },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error("vocabulary/import:", err);
    return res.status(500).json({ error: err?.message ?? "Server error" });
  }
}
