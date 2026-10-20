const DEFAULT_TEST_DATABASE_URL =
  'postgresql://insighthub:insighthub_password@localhost:5432/insighthub_test';

// globalSetup wipes this database, so refuse anything that isn't clearly a test database
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL;
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error(`Refusing to run tests against ${url}: the database name must end in _test`);
  }
  return url;
}
