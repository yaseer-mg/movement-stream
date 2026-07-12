module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/apps/.*/node_modules/'],
  moduleNameMapper: {
    '^wrtc$': '<rootDir>/__mocks__/wrtc.js',
  },
  collectCoverageFrom: [
    'apps/**/src/**/*.js',
    '!apps/**/node_modules/**',
  ],
};
