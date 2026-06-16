import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let instance: ReturnType<typeof drizzle<typeof fullSchema>>;

export function getDb() {
  if (!instance) {
    const client = new Database("./data/club.db");
    client.pragma("journal_mode = WAL");
    instance = drizzle(client, { schema: fullSchema });
  }
  return instance;
}
