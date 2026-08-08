/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/tests/**/*.test.ts'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  clearMocks: true,
  // express-rate-limit's in-memory store keeps a periodic cleanup timer alive across
  // test files that import authRouter; it's inert after the process would otherwise
  // exit, so force-exiting here just avoids Jest's noisy "did not exit gracefully"
  // warning instead of masking any real assertion failure (those still fail first).
  forceExit: true,
};
