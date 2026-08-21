import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15000,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_PATH: 'data/test.db',
      OPENAI_API_KEY: 'test-key',
      OPENAI_BASE_URL: 'http://127.0.0.1:4107/v1',
      ADMIN_TOKEN: 'test-admin-token',
      ENCRYPTION_KEY: 'test-encryption-secret',
    },
  },
})
