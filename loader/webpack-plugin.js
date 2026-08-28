/**
 * @chenyican/vue-fabric-editor —— 宿主接入插件（webpack）
 *
 * 作用：向宿主 webpack 自动注入「画布素材 URL 改写」规则，消费端只写一行：
 *
 *     // vue-cli（configureWebpack 里）
 *     const VfeAssetsPlugin = require('@chenyican/vue-fabric-editor/loader/webpack-plugin.js');
 *     module.exports = {
 *       configureWebpack: { plugins: [new VfeAssetsPlugin()] },
 *     };
 *
 *     // 或纯 webpack 配置
 *     plugins: [ new VfeAssetsPlugin() ]
 *
 * 背景与实现细节见 ./assets-loader.js 顶部注释（为什么必须改写、隐性契约是什么）。
 *
 * 选项（均可省略）：
 * - `test`：匹配需要改写的产物文件，默认 /vue-fabric-editor\.common\.js$/。
 *   同时消费 UMD 产物时可传 /vue-fabric-editor\.(common|umd)\.js$/。
 * - `fileLoader`：显式指定宿主 file-loader 的绝对路径（默认从宿主项目根自动解析）。
 *
 * 幂等：重复 apply（多实例、多 entry）只会注入一条规则。
 */
const path = require('path');

const APPLIED_FLAG = '__vfeAssetsPluginApplied';

class VfeAssetsPlugin {
  constructor(options = {}) {
    this.options = options || {};
  }

  apply(compiler) {
    const moduleOptions = compiler.options && compiler.options.module;
    const rules = moduleOptions && moduleOptions.rules;
    if (!Array.isArray(rules)) return;
    if (rules.some((rule) => rule && rule[APPLIED_FLAG])) return;

    const loaderPath = this.options.loader
      ? this.options.loader
      : require.resolve('./assets-loader.js');

    const rule = {
      [APPLIED_FLAG]: true,
      test: this.options.test || /vue-fabric-editor\.common\.js$/,
      enforce: 'pre',
      use: [{ loader: loaderPath }],
    };
    // 显式指定 file-loader 时通过 loader options 透传（loader 侧优先使用）
    if (this.options.fileLoader) {
      rule.use[0].options = { fileLoader: this.options.fileLoader };
    }

    rules.push(rule);
  }
}

module.exports = VfeAssetsPlugin;
// 兼容 ESM 互操作（import VfeAssetsPlugin from '...'）
module.exports.default = VfeAssetsPlugin;
// 便于诊断：暴露 loader 绝对路径
module.exports.loaderPath = path.join(__dirname, 'assets-loader.js');
