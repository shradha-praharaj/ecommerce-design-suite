import { defineConfig } from "drizzle-kit";
import path from "path";
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  tablesFilter: [
    "!checkpoints",
    "!checkpoint_blobs",
    "!checkpoint_migrations",
    "!checkpoint_writes",
  ],
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
