// /lib/mongo.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { MongoClient, Db } from "mongodb";
import { ObjectId } from "mongodb";

// ===== Types (your simplified set) =====
export type GameStatus = "PENDING" | "ACTIVE" | "COMPLETED" | "CANCELLED";

export interface UserDoc {
  _id?: ObjectId;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface VocabularyDoc {
  _id?: ObjectId;
  source: string;
  sourceLang: string;
  targetLang: string;
  sourceWords: Array<string>;
  targetWords: Array<string>;
  comment: string;
}

export interface GameDoc {
  _id?: ObjectId;
  userId: number; // per your type — stored as Number (int) in Mongo
  accessCode: string;
  status: GameStatus;
  createdAt: Date;
  updatedAt: Date;
  gameMode: number;
  name: string;
  vocabulary: any; // per your type
  startPosition: number;
  endPosition: number;
  nrWords: number;
}

// ===== Connection singleton =====
const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const dbName = process.env.MONGODB_DB || "vocab_game_db";

let client: MongoClient | null = null;
let db: Db | null = null;
let ensured = false;

export const GameStatuses = [
  "PENDING",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
] as const;

export async function getDb(): Promise<Db> {
  if (!client) {
    client = new MongoClient(uri, { ignoreUndefined: true });
    await client.connect();
  }
  if (!db) db = client.db(dbName);
  if (!ensured) {
    await ensureCollections(db);
    ensured = true;
  }
  return db;
}

export async function dropDatabase(): Promise<void> {
  const d = await getDb();
  await d.dropDatabase();
  // rebind and re-ensure
  db = client!.db(dbName);
  ensured = false;
  await ensureCollections(db);
  ensured = true;
}

// ===== One-time setup: exactly 3 collections =====
export async function ensureCollections(d: Db) {
  const existing = new Set(
    (await d.listCollections().toArray()).map((c) => c.name)
  );

  // 1) users
  if (!existing.has("users")) {
    await d.createCollection("users", {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["name", "email", "createdAt", "updatedAt"],
          additionalProperties: false,
          properties: {
            _id: {},
            name: { bsonType: "string" },
            email: { bsonType: "string" }, // required & non-null
            createdAt: { bsonType: "date" },
            updatedAt: { bsonType: "date" },
          },
        },
      },
    });
    await d.collection("users").createIndex({ email: 1 }, { unique: true });
    await d.collection("users").createIndex({ name: 1 });
  }

  // 2) vocabulary
  if (!existing.has("vocabulary")) {
    await d.createCollection("vocabulary", {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: [
            "source",
            "sourceLang",
            "targetLang",
            "sourceWords",
            "targetWords",
            "comment",
          ],
          additionalProperties: false,
          properties: {
            _id: {},
            source: { bsonType: "string" },
            sourceLang: { bsonType: "string" },
            targetLang: { bsonType: "string" },
            sourceWords: {
              bsonType: "array",
              minItems: 1,
              items: { bsonType: "string" },
            },
            targetWords: {
              bsonType: "array",
              minItems: 1,
              items: { bsonType: "string" },
            },
            comment: { bsonType: "string" },
          },
        },
      },
    });
    // helpful search index (multi-field)
    await d.collection("vocabulary").createIndex({
      sourceLang: 1,
      targetLang: 1,
      source: 1,
      // partial text support via array fields
      sourceWords: 1,
    });
  }

  // 3) games
  if (!existing.has("games")) {
    await d.createCollection("games", {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: [
            "accessCode",
            "status",
            "createdAt",
            "updatedAt",
            "gameMode",
            "name",
            "vocabulary",
            "startPosition",
            "endPosition",
            "nrWords",
            "players",
            "hostId",
          ],
          additionalProperties: false,
          properties: {
            _id: {},
            // host/owner of the lobby (used to start/end/kick, etc.)
            hostId: { bsonType: "int" }, // keep your int user id type

            // joinable via access code
            accessCode: { bsonType: "string" },

            // lifecycle
            status: { enum: Array.from(GameStatuses) }, // e.g., 'lobby','active','finished','abandoned'
            createdAt: { bsonType: "date" },
            updatedAt: { bsonType: "date" },
            startedAt: { bsonType: ["date", "null"] }, // NEW
            endedAt: { bsonType: ["date", "null"] }, // NEW

            // config
            gameMode: { bsonType: "int" },
            name: { bsonType: "string" },
            vocabulary: {}, // any (unchanged)
            startPosition: { bsonType: "int" },
            endPosition: { bsonType: "int" },
            nrWords: { bsonType: "int" },

            // lobby constraints (optional)
            minPlayers: { bsonType: ["int", "null"] },
            maxPlayers: { bsonType: ["int", "null"] },

            // multi-user: array of player objects
            players: {
              bsonType: "array",
              minItems: 1,
              items: {
                bsonType: "object",
                required: ["userId", "joinedAt", "score"],
                additionalProperties: false,
                properties: {
                  userId: { bsonType: "int" }, // your user id type
                  displayName: { bsonType: ["string", "null"] },
                  joinedAt: { bsonType: "date" },
                  leftAt: { bsonType: ["date", "null"] },
                  isBot: { bsonType: ["bool", "null"] },
                  // gameplay stats
                  score: { bsonType: "int" }, // current/ending score
                  correctAnswers: { bsonType: ["int", "null"] },
                  wrongAnswers: { bsonType: ["int", "null"] },
                  streak: { bsonType: ["int", "null"] },
                  // per-player state
                  isReady: { bsonType: ["bool", "null"] }, // for lobby ready checks
                  team: { bsonType: ["string", "null"] }, // optional (if you add teams later)
                },
              },
            },

            // winners (supports ties & team modes)
            winnerUserIds: {
              bsonType: ["array", "null"],
              items: { bsonType: "int" },
            },

            // optional lightweight event log (append-only, useful for audits/undo)
            events: {
              bsonType: ["array", "null"],
              items: {
                bsonType: "object",
                required: ["type", "ts"],
                additionalProperties: false,
                properties: {
                  type: { bsonType: "string" }, // e.g., 'PLAYER_JOINED','SCORE_UPDATED','GAME_STARTED','GAME_ENDED'
                  ts: { bsonType: "date" },
                  actorUserId: { bsonType: ["int", "null"] },
                  payload: {}, // anything (kept flexible)
                },
              },
            },
          },
        },
      },
    });

    // Helpful indexes
    await d
      .collection("games")
      .createIndex({ accessCode: 1 }, { unique: true });
    await d.collection("games").createIndex({ status: 1, updatedAt: -1 });
    await d.collection("games").createIndex({ "players.userId": 1, status: 1 });
  }

  await d.collection("games").createIndex({ accessCode: 1 }, { unique: true });
  await d.collection("games").createIndex({ userId: 1 });
  await d.collection("games").createIndex({ name: 1 });
}

// ===== Helpers =====
export function makeAccessCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++)
    out += chars[(Math.random() * chars.length) | 0];
  return out;
}
