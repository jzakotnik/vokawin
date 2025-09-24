import type { NextApiRequest, NextApiResponse } from "next";
import { ensureCollections, getDb, VocabularyDoc } from "@/lib/mongo";
import { Db } from "mongodb";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "Use POST" });
  try {
    // Optional: return what collections exist now
    const db = await getDb();
    const names = (await db.listCollections().toArray())
      .map((c) => c.name)
      .sort();

    res.status(200).json({
      ok: true,
      message: "Collections ensured (should be: users, vocabulary, games).",
      collections: names,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
}
