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
    // .vue SFC 在 node 测试环境不编译，用空组件 stub（仅当测试路径间接引到 .vue 时生效）
    '\\.(vue)$': '<rootDir>/tests/__mocks__/vueStub.js',
    // src 内部使用的 '@/xxx' 别名
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // lodash-es / @webtoon/psd 等 ESM 包需经 babel 转换
  transformIgnorePatterns: ['node_modules/(?!(lodash-es|@webtoon/psd))'],
};
