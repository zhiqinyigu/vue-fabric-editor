module.exports = {
  root: true,
  env: {
    node: true,
    es2021: true,
    jest: true,
  },
  extends: ['plugin:vue/recommended', 'eslint:recommended', 'plugin:prettier/recommended'],
  parserOptions: {
    parser: 'babel-eslint',
    ecmaVersion: 2021,
    sourceType: 'module',
  },
  rules: {
    // 与 .prettierrc.js 保持一致
    'prettier/prettier': ['error', require('./.prettierrc.js')],
    // 收敛规则，避免过度严格
    'no-irregular-whitespace': 'off',
    'vue/multi-word-component-names': 'off',
    'vue/require-default-prop': 'off',
    'vue/no-v-html': 'off',
    // 模板组件命名统一 PascalCase（大驼峰）
    // i 前缀为 ViewUI 组件（如 i-switch），Vue2 用 <iSwitch> 才能解析，需忽略
    'vue/component-name-in-template-casing': [
      'error',
      'PascalCase',
      {
        registeredComponentsOnly: false,
        ignores: ['keep-alive', 'router-view', 'transition-group', 'component', 'i-*', '/^i[A-Z]/'],
      },
    ],
    // h: Vue JSX 渲染函数的 pragma 参数（编译期使用，静态检查看不到）
    // _ 前缀: 明确不需要使用的形参
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_|^h$' }],
    'no-console': 'off',
  },
  overrides: [
    {
      files: ['*.vue'],
      rules: {
        'vue/require-explicit-emits': 'off',
        'vue/v-on-event-hyphenation': 'off',
        'vue/attribute-hyphenation': 'off',
      },
    },
  ],
};
