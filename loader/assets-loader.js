/**
 * @chenyican/vue-fabric-editor —— 画布素材 URL 改写 loader
 *
 * ## 为什么需要它（消费端必须了解的事实）
 *
 * 本包的 lib 产物（`dist/vue-fabric-editor/vue-fabric-editor.common.js`）由
 * `vue-cli --target lib` 构建，产物内嵌 `@vue/cli-service/.../setPublicPath.js`，
 * 会在浏览器端把 webpack runtime 的 `__webpack_require__.p` 覆盖为
 * 「当前 script 所在目录」（即宿主的 chunk 目录）。
 *
 * 而产物里这些素材用的是 file-loader 的 URL 形式：
 *
 *     __webpack_require__.p + "xxx.svg"        // 控制条 / 锁 / 多边形控件图标
 *     __webpack_require__.p + "img/xxx.png"    // 滤镜预设缩略图
 *
 * 于是运行时会去请求 `<宿主 chunk 目录>/xxx.svg` —— 但宿主 webpack 不会把
 * node_modules 里「未被 require 的包内文件」复制到自己的输出目录，请求必然 404。
 * 图标 broken 后 fabric 渲染控制条时 `ctx.drawImage(img)` 抛
 * `InvalidStateError: The image argument is a canvas element with a width or height of 0`，
 * 表现为选中/拖动元素即报错。
 *
 * ## 本 loader 做什么
 *
 * 把上述 URL 形式改写为「相对该产物文件的 require」，交给**宿主** webpack 的
 * file-loader 处理：素材随宿主构建输出、URL 按宿主 publicPath 生成、与项目其它
 * 静态资源策略完全一致。
 *
 *     __webpack_require__.p + "img/x.png"   →   __VFE_ASSETS__["img/x.png"]
 *     var __VFE_ASSETS__ = { "img/x.png": require("!!<宿主 file-loader>!./img/x.png") }
 *
 * ## 消费端如何接入
 *
 * 推荐（一行）：
 *
 *     // vue-cli（chainWebpack 之外、configureWebpack 里）
 *     const VfeAssetsPlugin = require('@chenyican/vue-fabric-editor/loader/webpack-plugin.js');
 *     module.exports = { configureWebpack: { plugins: [new VfeAssetsPlugin()] } };
 *
 * 或不使用 plugin、手写规则（等价）：
 *
 *     config.module.rule('vfe-assets')
 *       .test(/vue-fabric-editor\.common\.js$/)
 *       .enforce('pre')
 *       .use('vfe-assets')
 *       .loader(require.resolve('@chenyican/vue-fabric-editor/loader/assets-loader.js'))
 *       .end();
 *
 * 若宿主还消费 UMD 产物（`vue-fabric-editor.umd.js`），把 test 改为
 * `/vue-fabric-editor\.(common|umd)\.js$/`（默认插件同样支持 `test` 选项）。
 *
 * ## 前置条件（隐性契约）
 *
 * 1. 宿主项目能解析到 `file-loader`（vue-cli 4/5 默认自带；纯手写 webpack 需自行安装）。
 *    本 loader 用 `this.rootContext`（宿主项目根）解析，避免落在包内解析失败。
 * 2. 宿主不要对 `node_modules` 内的 `.svg` / `.png` 施加「转成组件」之类的规则，
 *    否则 require 结果不是 URL 字符串。
 * 3. 仅适用于 webpack。Vite / Rspack 需自行实现等价插件（把本逻辑搬进 transform/publicPath 处理）。
 *
 * ## 实现注意（勿改）
 *
 * - 必须把 require 提升到本文件顶层执行，不能就地写在产物内部模块函数里：
 *   产物内部模块签名是 `function (module, exports, __webpack_require__)`，
 *   第三个形参就是产物自带的 runtime；而宿主 webpack 会把源码里的 `require` 改写成
 *   `__webpack_require__`，就地写会被该形参遮蔽，变成拿「宿主模块 id」去查产物自己的
 *   模块表 → `TypeError: Cannot read properties of undefined (reading 'call')`，
 *   产物初始化中断 → 所有命名导出（extractVariables 等）取到 undefined。
 *   提升到顶层后，`require` 落在宿主模块作用域（外层 __webpack_require__ 未被遮蔽），
 *   产物内部模块通过闭包变量 __VFE_ASSETS__ 取值，不再经过产物 runtime。
 * - 注入的 file-loader 路径统一转成正斜杠，避免 Windows 反斜杠在 request 中被转义。
 */

const { collectAssetRefs, rewriteToAssetMap } = require('./assets-core');

module.exports = function assetsLoader(content) {
  // 没有命中（例如已被改写或产物变更）→ 原样返回，绝不阻断构建
  if (!collectAssetRefs(content).length) return content;

  // file-loader 路径：支持通过 loader options（VfeAssetsPlugin 的 fileLoader）显式指定，
  // 否则从宿主项目根解析；解析不到时给出可操作的报错
  const loaderOptions = this.query && typeof this.query === 'object' ? this.query : {};
  let fileLoaderPath = loaderOptions.fileLoader;
  if (!fileLoaderPath) {
    try {
      fileLoaderPath = require.resolve('file-loader', {
        paths: [this.rootContext || process.cwd()],
      });
    } catch (e) {
      throw new Error(
        '[vfe] 未能在宿主项目解析到 file-loader。请安装 file-loader（vue-cli 默认自带），' +
          '或在 VfeAssetsPlugin 中通过 { fileLoader: "<绝对路径>" } 显式指定。\n' +
          '原始错误：' +
          e.message
      );
    }
  }
  fileLoaderPath = fileLoaderPath.replace(/\\/g, '/');

  return rewriteToAssetMap(
    content,
    (assetPath) =>
      `require("!!${fileLoaderPath}!./${assetPath.replace(/^\.\//, '')}")`
  );
};
