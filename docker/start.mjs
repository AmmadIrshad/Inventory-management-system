// Container entrypoint: waits until every migration shipped in this image has been applied
// (by the `migrate` job), then starts the Next.js server. This keeps the app from serving
// requests against an older schema even when the orchestrator starts both at once.
import { readdirSync } from "node:fs";
import pg from "pg";

const POLL_MS = 2000;
const timeoutMs = Number(process.env.MIGRATION_WAIT_TIMEOUT_MS ?? 5 * 60 * 1000);

const expected = readdirSync(new URL("./prisma/migrations/", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

async function missingMigrations() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const { rows } = await client.query(
      "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL",
    );
    const applied = new Set(rows.map((row) => row.migration_name));
    return expected.filter((name) => !applied.has(name));
  } catch (error) {
    // 42P01: the migrations table doesn't exist yet (first deploy).
    if (error.code !== "42P01") console.warn(`[start] database not ready: ${error.message}`);
    return expected;
  } finally {
    await client.end().catch(() => {});
  }
}

const deadline = Date.now() + timeoutMs;
for (let missing = await missingMigrations(); missing.length > 0; missing = await missingMigrations()) {
  if (Date.now() > deadline) {
    console.error(`[start] gave up waiting for migrations: ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log(`[start] waiting for migrations: ${missing.join(", ")}`);
  await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}

console.log(`[start] database schema is current (${expected.length} migrations)`);
await import("./server.js");
