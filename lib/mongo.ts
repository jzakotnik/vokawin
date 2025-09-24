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
            "userId",
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
          ],
          additionalProperties: false,
          properties: {
            _id: {},
            userId: { bsonType: "int" }, // per your type
            accessCode: { bsonType: "string" },
            status: { enum: Array.from(GameStatuses) },
            createdAt: { bsonType: "date" },
            updatedAt: { bsonType: "date" },
            gameMode: { bsonType: "int" },
            name: { bsonType: "string" },
            vocabulary: {}, // any
            startPosition: { bsonType: "int" },
            endPosition: { bsonType: "int" },
            nrWords: { bsonType: "int" },
          },
        },
      },
    });
    await d
      .collection("games")
      .createIndex({ accessCode: 1 }, { unique: true });
    await d.collection("games").createIndex({ userId: 1 });
    await d.collection("games").createIndex({ name: 1 });
  }
}

// ===== Helpers =====
export function makeAccessCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++)
    out += chars[(Math.random() * chars.length) | 0];
  return out;
}
