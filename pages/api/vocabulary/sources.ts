/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDb } from "@/lib/mongo";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const db = await getDb();

    // Aggregation, um alle einzigartigen Quellen aus dem Feld `source` zu erhalten
    const sources = await db.collection("vocabulary").distinct("source");

    // Rückgabe als Array von Objekten mit id und label
    const formatted = sources.map((s: string) => ({ id: s, label: s }));

    res.status(200).json(formatted);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: "Fehler beim Abrufen der Vokabelquellen" });
  }
}
