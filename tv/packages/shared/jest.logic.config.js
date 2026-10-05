// Pure-logic tests (no React Native runtime): node + babel only.
module.exports = {
  transform: {'^.+\\.(js|jsx|ts|tsx)$': 'babel-jest'},
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  testMatch: ['<rootDir>/src/marble/__tests__/**/*.test.ts'],
  testEnvironment: 'node',
};
