import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { resolveTestDatabaseUrl } from "./test-database";

/** Creates the test database if needed and applies all migrations to it. */
export default async function globalSetup() {
  const testUrl = resolveTestDatabaseUrl();
  const databaseName = new URL(testUrl).pathname.slice(1);

  const adminUrl = new URL(testUrl);
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
    if (!rowCount) await admin.query(`CREATE DATABASE "${databaseName.replaceAll('"', '""')}"`);
  } finally {
    await admin.end();
  }

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "pipe",
  });
}
