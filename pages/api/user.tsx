// pages/api/example.ts
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  switch (req.method) {
    case "GET": {
      // get game from Prisma
      return res.status(200).json({ ok: true, method: "GET" });
    }
    case "POST": {
      // create user from Prisma
      const created = await createUser(req.body);
      return res.status(201).json({ ok: true, method: "POST" });
    }
    default: {
      res.setHeader("Allow", ["GET", "POST"]);
      return res
        .status(405)
        .json({ error: `Method ${req.method} Not Allowed` });
    }
  }
}

// (optional) tweak body parsing, etc.
// export const config = { api: { bodyParser: true } };
