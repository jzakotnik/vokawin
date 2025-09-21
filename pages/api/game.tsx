// pages/api/example.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma as GcP, Prisma } from "@prisma/client";
import { prisma as gcDb } from "@/lib/prisma";

import {
  createGameConfiguration,
  getGameConfigurationById,
} from "@/services/gameConfiguration";
import { getUserByEmail } from "@/services/user";
import { createGame } from "@/services/game";
import { genAccessCode } from "@/lib/utils";

type Err = { error: string };

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
      // create game from Prisma
      const configuration = await createGameConfiguration(req.body);
      const newGame: GcP.GameCreateInput= {accessCode:"huhu",user:"haha",gameConfiguration:configuration} 
      await createGame( GcP.GameConfigurationCreateInput
      
      console.log("Game to be created", data);
      const created = await createGame(data);
      console.log("Created game", configuration, created);
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
