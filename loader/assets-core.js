/**
 * @chenyican/vue-fabric-editor —— 画布素材处理共享核心
 *
 * 目的：把「产物里素材引用的识别与改写」抽成纯函数，供各打包器适配层复用，
 * 避免 webpack / Vite / Rollup / esbuild 各自实现导致逻辑漂移。
 *
 * 产物中的素材引用形态（由 lib 构建的 file-loader 生成）：
 *
 *     __webpack_require__.p + "middlecontrol.svg"
 *     __webpack_require__.p + "img/BlackWhite.png"
 *
 * 背景与宿主契约见 PACKAGING.md §4.5。
 */

// file-loader 在产物中生成的资源 URL 形式
const ASSET_URL_RE = /__webpack_require__\.p \+ "([^"]+)"/g;

/**
 * 收集产物内容中的素材相对路径（去重，保持出现顺序）
 * @param {string} content 产物源码
 * @returns {string[]} 例如 ['img/BlackWhite.png', 'middlecontrol.svg']
 */
function collectAssetRefs(content) {
  const refs = [];
  const re = new RegExp(ASSET_URL_RE.source, 'g');
  let match;
  while ((match = re.exec(content)) !== null) {
    if (refs.indexOf(match[1]) === -1) refs.push(match[1]);
  }
  return refs;
}

/**
 * 改写产物中的素材引用
 * @param {string} content 产物源码
 * @param {(assetPath: string) => string} toReplacement 为每个素材路径生成替换表达式
 * @returns {string} 改写后的源码
 */
function rewriteAssetRefs(content, toReplacement) {
  return content.replace(new RegExp(ASSET_URL_RE.source, 'g'), (_m, assetPath) =>
    toReplacement(assetPath)
  );
}

/**
 * 把素材引用改写为「宿主 webpack 的 require」形式，并前置 `__VFE_ASSETS__` 映射。
 *
 * 说明：映射定义必须是**模块顶层**的 `require`（不能就地写在被改写的模块函数体内）——
 * 产物内模块签名是 `function (module, exports, __webpack_require__)`，其形参会遮蔽
 * 宿主注入的 `require`，就地写会变成查询产物自身模块表并抛
 * `TypeError: Cannot read properties of undefined (reading 'call')`。
 *
 * @param {string} content 产物源码
 * @param {(assetPath: string) => string} makeRequire 生成 require 表达式（如 `require("!!/abs/file-loader!./img/x.png")`）
 * @returns {string} 改写后的源码（无素材引用时原样返回）
 */
function rewriteToAssetMap(content, makeRequire) {
  const refs = collectAssetRefs(content);
  if (!refs.length) return content;
  const rewritten = rewriteAssetRefs(
    content,
    (assetPath) => `__VFE_ASSETS__[${JSON.stringify(assetPath)}]`
  );
  const map = refs.map((p) => `${JSON.stringify(p)}: ${makeRequire(p)}`).join(',');
  return `var __VFE_ASSETS__ = {${map}};\n${rewritten}`;
}

module.exports = {
  ASSET_URL_RE,
  collectAssetRefs,
  rewriteAssetRefs,
  rewriteToAssetMap,
};
