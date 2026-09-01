module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  moduleFileExtensions: ['js', 'json'],
  moduleNameMapper: {
    '^canvas$': '<rootDir>/tests/__mocks__/canvas.js',
  },
  // lodash-es 是 ESM 包，需经 babel 转换
  transformIgnorePatterns: ['node_modules/(?!lodash-es)'],
};
