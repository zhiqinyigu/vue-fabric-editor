module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  moduleFileExtensions: ['js', 'json'],
  moduleNameMapper: {
    '^canvas$': '<rootDir>/tests/__mocks__/canvas.js',
    '\\.(svg|png|jpg|jpeg|gif|webp)$': '<rootDir>/tests/__mocks__/assetStub.js',
    // .css 样式（ContextMenu 等编辑器链路）node 测试环境吞掉
    '\\.(css|less)$': '<rootDir>/tests/__mocks__/assetStub.js',
  },
  // lodash-es / @webtoon/psd 等 ESM 包需经 babel 转换
  transformIgnorePatterns: ['node_modules/(?!(lodash-es|@webtoon/psd))'],
};
