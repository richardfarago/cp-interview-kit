import { testDatabaseUrl } from './testDb';

// Runs before each test file, so src/index.ts sees these when it is imported
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.DATABASE_URL = testDatabaseUrl();
