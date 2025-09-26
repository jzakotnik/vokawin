import type { NextApiRequest, NextApiResponse } from "next";

import { getDb } from "@/lib/mongo";

// Einfache Pages-Router API (nur Schema A):
// Jeder Dokumenteintrag hat die Felder { source, word, translation } auf Root-Ebene.
// GET /api/vocabulary?source=...
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { source } = req.query;
  if (!source || typeof source !== "string") {
    return res
      .status(400)
      .json({ error: "Parameter 'source' ist erforderlich" });
  }

  try {
    const db = await getDb();

    const pairs = await db.collection("vocabulary").find({ source }).toArray();

    return res.status(200).json(pairs);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: "Fehler beim Abrufen der Wortpaare" });
  }
}
