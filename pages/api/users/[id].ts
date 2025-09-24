/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/api/users/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getDb, type UserDoc } from "@/lib/mongo";
import { ObjectId } from "mongodb";

function parseId(idStr: string) {
  return /^[a-fA-F0-9]{24}$/.test(idStr) ? new ObjectId(idStr) : idStr;
}

// Helper that extracts the user whether the result is ModifyResult<T> or T|null
function unwrapUpdated<T>(r: unknown): T | null {
  if (r && typeof r === "object" && "value" in (r as any)) {
    return (r as any).value ?? null; // ModifyResult<T> case
  }
  return (r as T) ?? null; // T | null case
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const db = await getDb();
  const users = db.collection<UserDoc>("users");
  const idParam = String(req.query.id);
  const _id = parseId(idParam);

  try {
    if (req.method === "GET") {
      const user = await users.findOne({ _id } as any);
      if (!user) return res.status(404).json({ error: "User not found" });
      return res.status(200).json({ user });
    }

    if (req.method === "PATCH") {
      const { name, email } = (req.body ?? {}) as Partial<UserDoc>;
      const $set: Partial<UserDoc> = { updatedAt: new Date() };

      if (name !== undefined) {
        if (typeof name !== "string" || !name.trim()) {
          return res
            .status(400)
            .json({ error: "name must be a non-empty string" });
        }
        $set.name = name.trim();
      }
      if (email !== undefined) {
        if (typeof email !== "string" || !email.trim()) {
          return res
            .status(400)
            .json({ error: "email must be a non-empty string" });
        }
        $set.email = email.trim();
      }

      const updated = await users.findOneAndUpdate(
        { _id } as any,
        { $set },
        { returnDocument: "after" } // works across driver versions
      );

      const user = unwrapUpdated<UserDoc>(updated);
      if (!user) return res.status(404).json({ error: "User not found" });
      return res.status(200).json({ ok: true, user });
    }

    if (req.method === "DELETE") {
      const { deletedCount } = await users.deleteOne({ _id } as any);
      if (!deletedCount)
        return res.status(404).json({ error: "User not found" });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["GET", "PATCH", "DELETE"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (e: any) {
    if (e?.code === 11000)
      return res.status(409).json({ error: "email already exists" });
    console.error("users/[id] error:", e);
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
}
