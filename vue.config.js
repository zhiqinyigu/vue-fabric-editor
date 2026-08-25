module.exports = {
  transpileDependencies: [],
  productionSourceMap: false,
  publicPath: process.env.NODE_ENV === 'production' ? process.env.VUE_APP_BASE_PATH || '/' : '/',
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
  },
};
