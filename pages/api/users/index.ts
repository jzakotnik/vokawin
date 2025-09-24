/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/api/users/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getDb, type UserDoc } from "@/lib/mongo";

export const config = {
  api: { bodyParser: { sizeLimit: "256kb" } },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const db = await getDb();
  const users = db.collection<UserDoc>("users");

  if (req.method === "GET") {
    const q = String(req.query.q ?? "").trim();
    const limit = Math.min(
      parseInt(String(req.query.limit ?? "20"), 10) || 20,
      100
    );
    const skip = parseInt(String(req.query.skip ?? "0"), 10) || 0;

    const filter = q
      ? {
          $or: [
            { name: { $regex: q, $options: "i" } },
            { email: { $regex: q, $options: "i" } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      users
        .find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .toArray(),
      users.countDocuments(filter),
    ]);

    return res.status(200).json({ items, total, limit, skip });
  }

  if (req.method === "POST") {
    try {
      const { name, email } = (req.body ?? {}) as Partial<UserDoc>;

      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "name is required" });
      }
      if (!email || typeof email !== "string" || !email.trim()) {
        return res.status(400).json({ error: "email is required" });
      }

      const now = new Date();
      const doc: Omit<UserDoc, "_id"> = {
        name: name.trim(),
        email: email.trim(),
        createdAt: now,
        updatedAt: now,
      };

      const result = await users.insertOne(doc as any);
      const inserted = await users.findOne({ _id: result.insertedId });

      return res.status(201).json({ ok: true, user: inserted });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      // duplicate email is likely (unique index)
      if (e?.code === 11000) {
        return res.status(409).json({ error: "email already exists" });
      }
      return res.status(500).json({ error: e?.message ?? "Server error" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ error: "Method Not Allowed" });
}
