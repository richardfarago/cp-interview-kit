import { execSync } from 'child_process';
import { testDatabaseUrl } from './testDb';

// Recreate the test database from the Prisma schema once per test run
export default function globalSetup() {
  execSync('npx prisma db push --force-reset --skip-generate', {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: 'inherit'
  });
}
