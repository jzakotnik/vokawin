// pages/api/vocabulary/import.ts
import { getDb, VocabularyDoc } from "@/lib/mongo";
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

type Pair = [string, string];

async function insertVocabularyFromPairs(opts: {
  source: string;
  sourceLang: string;
  targetLang: string;
  pairs: Pair[]; // e.g. [ ["cat","Katze"], ["dog","Hund"] ]
  comment?: string;
}) {
  const { source, sourceLang, targetLang, pairs, comment = "" } = opts;

  const sourceWords = pairs.map(([s]) => s?.trim()).filter(Boolean);
  const targetWords = pairs.map(([, t]) => t?.trim()).filter(Boolean);

  if (!sourceWords.length || !targetWords.length) {
    throw new Error(
      "Both sourceWords and targetWords must have at least one item."
    );
  }
  if (sourceWords.length !== targetWords.length) {
    throw new Error(
      "pairs must be 1:1 (sourceWords.length === targetWords.length)."
    );
  }
  const db = await getDb();
  const res = await db.collection<VocabularyDoc>("vocabulary").insertOne({
    source,
    sourceLang,
    targetLang,
    sourceWords,
    targetWords,
    comment,
  });

  return res.insertedId;
}

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
    console.log("API received some import excel", meta, rows);

    const pairs: Pair[] = rows
      .map((r) => [r.col1, r.col2] as Pair)
      .map(([a, b]) => [String(a ?? "").trim(), String(b ?? "").trim()] as Pair)
      .filter(([a, b]) => a.length > 0 && b.length > 0);

    if (pairs.length === 0) {
      return res
        .status(400)
        .json({ error: "No valid (col1,col2) pairs found." });
    }

    const insertedId = await insertVocabularyFromPairs({
      source,
      sourceLang,
      targetLang,
      pairs,
      comment,
    });

    return res.status(200).json({
      ok: true,
      insertedId,
      received: rows.length,
      importedPairs: pairs.length,
      meta: { source, sourceLang, targetLang },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error("vocabulary/import:", err);
    return res.status(500).json({ error: err?.message ?? "Server error" });
  }
}
