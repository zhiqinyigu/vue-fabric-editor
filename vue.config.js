const path = require('path');
const resolve = (dir) => path.resolve(__dirname, dir);

const isLib =
  process.argv.indexOf('--target') !== -1 &&
  process.argv[process.argv.indexOf('--target') + 1] === 'lib';

const libExternals = {
  vue: 'vue',
  'view-design': 'view-design',
  '@vue/composition-api': '@vue/composition-api',
  // 运行时单实例门面（src/core/runtime.js）内部对 composition-api 的「懒加载 fallback」
  // 用的是深层路径（为避开下面的精确 alias），此处把它映射回包名：
  // 产物中仍是 require('@vue/composition-api')，由消费方解析到自己的副本。
  '@vue/composition-api/dist/vue-composition-api.common.js': '@vue/composition-api',
  fabric: 'fabric',
  'lodash-es': 'lodash-es',
  dayjs: 'dayjs',
  qs: 'qs',
  uuid: 'uuid',
  'vue-i18n': 'vue-i18n',
  fontfaceobserver: 'fontfaceobserver',
  'hotkeys-js': 'hotkeys-js',
  jsbarcode: 'jsbarcode',
  'qr-code-styling': 'qr-code-styling',
  // svg-path-editor-lib 不做 external：纯函数库（无实例共享问题），打包进产物并经
  // transpileDependencies 转译为 ES5 —— 消费方（尤其 webpack4）无需再解析其 ES2022 产物，
  // 也无需 transpileDependencies 配置。
  'number-precision': 'number-precision',
  events: 'events',
  tapable: 'tapable',
  'vue-clipboard2': 'vue-clipboard2',
  'vue-cropper': 'vue-cropper',
  'vue-lazyload': 'vue-lazyload',
  'vue-masonry': 'vue-masonry',
  '@webtoon/psd': '@webtoon/psd',
  // 注：不再 external `core-js`。产物中没有任何 `require('core-js')`（polyfill 由宿主 babel
  // preset-env 决定），保留该 external 属死配置，且易让消费方误以为必须提供 core-js。
};

module.exports = {
  transpileDependencies: ['svg-path-editor-lib'],
  productionSourceMap: false,
  publicPath: process.env.NODE_ENV === 'production' ? process.env.VUE_APP_BASE_PATH || '/' : '/',
  configureWebpack: isLib
    ? {
        externals: libExternals,
      }
    : {},
  devServer: {
    port: 3000,
    open: true,
    proxy: {
      '/fontFile': {
        target: 'https://github.com/',
        changeOrigin: true,
        pathRewrite: (path) => path.replace(/^\/fontFile/, ''),
      },
    },
  },
  css: {
    loaderOptions: {
      less: {
        lessOptions: {
          javascriptEnabled: true,
        },
      },
    },
  },
  chainWebpack: (config) => {
    // node_modules 内的 svg（如 view-design 字体图标）→ 按 url 资源处理
    config.module
      .rule('svg-node-modules')
      .test(/\.svg$/)
      .include.add(/node_modules/)
      .end()
      .use('file-loader')
      .loader('file-loader')
      .options({ name: 'img/[name].[hash:8].[ext]' });

    // svg → Vue 组件（对应 vite-svg-loader 的行为，官方 babel-loader + vue-svg-loader 配置）
    config.module
      .rule('svg')
      .test(/\.svg$/)
      .exclude.add(/node_modules/)
      .end()
      .uses.clear();
    config.module
      .rule('svg')
      .use('babel-loader')
      .loader('babel-loader')
      .end()
      .use('vue-svg-loader')
      .loader('vue-svg-loader');

    // 核心引擎内部需要的 svg 资源地址（等价 v3 的 `?url`），
    //    通过 `!!file-loader!` 内联语法跳过上述规则
    // 兼容 Node events（webpack4 下 npm events 包正常解析）
    config.resolve.set('symlinks', true);

    if (isLib) {
      // 运行时单实例门面：lib 构建中，库内所有 '@vue/composition-api' 引用改走
      // src/core/runtime.js（由消费方通过 installRuntime 注入单例；未注入时回退到解析到的副本）。
      // 用精确匹配（$）以保证门面自身对 '@vue/composition-api/dist/...' 的 fallback 不被拦截。
      config.resolve.alias.set('@vue/composition-api$', resolve('src/core/runtime.js'));
    }
  },
};
