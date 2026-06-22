import fs from "node:fs";
import path from "node:path";
import { generateSupabaseSeedSql } from "../src/seed-sql.js";

const root = path.resolve(import.meta.dirname, "../../..");
const target = path.join(root, "supabase/seed.sql");
const generated = generateSupabaseSeedSql();

if (process.argv.includes("--check")) {
  if (fs.readFileSync(target, "utf8") !== generated) {
    console.error("supabase/seed.sql is stale; run pnpm catalog:generate");
    process.exit(1);
  }
  console.log("generated Supabase seed is current");
} else {
  fs.writeFileSync(target, generated);
  console.log(`generated ${path.relative(root, target)}`);
}
