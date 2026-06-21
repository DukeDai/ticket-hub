/**
 * Vitest setup — runs before any test modules are loaded.
 * Sets MONGODB_URI to a placeholder so that db.ts does not throw at module evaluation time.
 * The real URI (in-memory server) is injected via setupTestDB() in test files.
 */
process.env.MONGODB_URI = 'mongodb://localhost:27017/test-placeholder';
