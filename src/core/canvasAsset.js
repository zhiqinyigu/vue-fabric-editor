/*
 * 画布素材的运行时解析
 *
 * ## 两条接入路径（消费方二选一）
 *
 * 库产物里的 13 个画布素材（5 个控件图标 svg + 8 个滤镜缩略图 png）在 lib 构建中是
 * file-loader 产出的 URL，形如 `__webpack_require__.p + "middlecontrol.svg"`。
 * 宿主 webpack 不会复制 node_modules 内的包内文件，因此必须二选一：
 *
 * 1. **webpack 项目**：挂载 `VfeAssetsPlugin`（见 loader/webpack-plugin.js）。
 *    插件把上述引用改写为宿主自身的 require，素材由宿主 file-loader 输出，
 *    URL 跟随宿主 publicPath —— 无需托管、零运行时配置。
 * 2. **其它打包器（Vite / Rollup / esbuild / 未挂插件的 webpack 等）**：
 *    调用 `installRuntime({ assetsBaseUrl })` 或 `setCanvasAssetsBaseUrl(...)`，
 *    并把包内 `dist/vue-fabric-editor/` 下的素材托管到该基址：
 *
 *    ```js
 *    installRuntime({ vue, compositionApi, assetsBaseUrl: '/static/vfe-assets/' });
 *    // 或 CDN：'https://cdn.jsdelivr.net/npm/@chenyican/vue-fabric-editor@x.y.z/dist/vue-fabric-editor/'
 *    ```
 *
 * 两条路径天然互斥：第 1 条下引用已被改写，本模块的 fallback 不再被使用；
 * 第 2 条下未改写，由 `resolveCanvasAsset` 用基址拼出 URL。
 *
 * 素材的**相对路径即逻辑名**（lib 构建已固定命名，不带 hash）：
 * - 控件图标：`middlecontrol.svg` / `middlecontrolhoz.svg` / `edgecontrol.svg` /
 *   `rotateicon.svg` / `lock.svg`
 * - 滤镜缩略图：`img/<中文名对应的英文名>.png`（如 `img/BlackWhite.png`）
 *
 * 详见 PACKAGING.md §4.5「画布素材资源与宿主接入契约」。
 */

const DOC_HINT = '@chenyican/vue-fabric-editor 的 PACKAGING.md §4.5「画布素材资源与宿主接入契约」';

// 素材基址：字符串（目录，自动补 /）或函数 (relativePath) => url
let assetsBaseUrl = null;

// 失败上报去重（同一素材只提示一次，避免刷屏）
const reportedFailures = {};

/** 设置素材基址（'' / null 表示清除） */
export function setCanvasAssetsBaseUrl(baseUrl) {
  assetsBaseUrl = baseUrl || null;
}

/** 读取当前素材基址 */
export function getCanvasAssetsBaseUrl() {
  return assetsBaseUrl;
}

/** 是否已配置素材基址 */
export function isCanvasAssetsBaseConfigured() {
  return !!assetsBaseUrl;
}

function joinUrl(base, relativePath) {
  if (typeof base === 'function') return base(relativePath);
  if (base.charAt(base.length - 1) === '/') return base + relativePath;
  return `${base}/${relativePath}`;
}

/**
 * 解析画布素材 URL
 * @param {string} relativePath 素材相对路径（即逻辑名，如 'img/BlackWhite.png'）
 * @param {string} fallbackUrl 未配置基址时使用（file-loader 产出的 URL，走 webpack 插件路径）
 * @returns {string}
 */
export function resolveCanvasAsset(relativePath, fallbackUrl) {
  if (!assetsBaseUrl) return fallbackUrl;
  return joinUrl(assetsBaseUrl, relativePath);
}

/**
 * 上报素材加载失败（同一素材只报一次），给出可照做的两种接入方式
 * @param {string} relativePath 素材相对路径
 * @param {string} resolvedUrl 实际请求的 URL
 */
export function reportCanvasAssetFailure(relativePath, resolvedUrl) {
  if (reportedFailures[relativePath]) return;
  reportedFailures[relativePath] = true;
  // eslint-disable-next-line no-console
  console.error(
    `[vfe] 画布素材加载失败（${relativePath}）\n` +
      `  实际请求：${resolvedUrl}\n` +
      '  请二选一接入：\n' +
      '  1) webpack 项目：挂载 VfeAssetsPlugin（素材随宿主构建输出，无需托管）；\n' +
      '  2) 其它打包器（Vite / Rollup / esbuild 等）：installRuntime({ assetsBaseUrl })，' +
      '并把包内 dist/vue-fabric-editor 下的素材托管到该基址。\n' +
      `  详见 ${DOC_HINT}`
  );
}

export default {
  setCanvasAssetsBaseUrl,
  getCanvasAssetsBaseUrl,
  isCanvasAssetsBaseConfigured,
  resolveCanvasAsset,
  reportCanvasAssetFailure,
};
