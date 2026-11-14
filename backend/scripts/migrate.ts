import { openDatabase } from "../src/db/client";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL not set: skipping migrations (local dev migrates PGlite on start)");
} else {
  const database = openDatabase({ url });
  await database.migrate();
  await database.close();
  console.log("migrations applied");
}
