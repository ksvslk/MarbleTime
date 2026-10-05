// Pure-logic tests (no React Native runtime): node + babel only.
module.exports = {
  transform: {'^.+\\.(js|jsx|ts|tsx)$': 'babel-jest'},
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  testMatch: ['<rootDir>/src/marble/__tests__/**/*.test.ts'],
  testEnvironment: 'node',
  // Sounds and pictures are just ids to the logic.
  moduleNameMapper: {'\\.(mp3|png)$': '<rootDir>/src/marble/__tests__/asset.js'},
};
