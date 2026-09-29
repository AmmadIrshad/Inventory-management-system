import { config } from "dotenv";

/** Loads `.env` (if present) and returns TEST_DATABASE_URL, refusing anything not named *_test. */
export function resolveTestDatabaseUrl(): string {
  config({ quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }
  const databaseName = new URL(url).pathname.slice(1);
  if (!databaseName.endsWith("_test")) {
    throw new Error(`Refusing to run tests against "${databaseName}": the name must end in _test.`);
  }
  return url;
}
