import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required for Drizzle migrations.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle/migrations",
  schemaFilter: ["public"],
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
