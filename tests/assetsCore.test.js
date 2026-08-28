/**
 * 画布素材处理共享核心（loader/assets-core.js）测试
 *
 * 这是各打包器适配层（webpack loader / 未来 Vite、Rollup 插件）的共同底座，
 * 因此单独锁住行为：识别、去重、改写、幂等、无引用时不动内容。
 */
const {
  ASSET_URL_RE,
  collectAssetRefs,
  rewriteAssetRefs,
  rewriteToAssetMap,
} = require('../loader/assets-core');

const BUNDLE = `var a = __webpack_require__.p + "middlecontrol.svg";
var b = __webpack_require__.p + "img/BlackWhite.png";
var c = __webpack_require__.p + "middlecontrol.svg";
var d = "not an asset";
`;

describe('loader/assets-core', () => {
  it('collectAssetRefs：按出现顺序去重收集素材相对路径', () => {
    expect(collectAssetRefs(BUNDLE)).toEqual(['middlecontrol.svg', 'img/BlackWhite.png']);
    expect(collectAssetRefs('no assets here')).toEqual([]);
  });

  it('rewriteAssetRefs：按回调替换每个引用，但不新增映射头', () => {
    const out = rewriteAssetRefs(BUNDLE, (p) => `URL(${p})`);
    expect(out).toContain('var a = URL(middlecontrol.svg)');
    expect(out).toContain('var b = URL(img/BlackWhite.png)');
    expect(out).not.toContain('__webpack_require__.p + "');
    expect(out).not.toContain('__VFE_ASSETS__');
  });

  it('rewriteToAssetMap：前置 __VFE_ASSETS__ 映射并改写引用', () => {
    const out = rewriteToAssetMap(BUNDLE, (p) => `require("!!loader!./${p}")`);
    expect(out.startsWith('var __VFE_ASSETS__ = {')).toBe(true);
    expect(out).toContain('"middlecontrol.svg": require("!!loader!./middlecontrol.svg")');
    expect(out).toContain('"img/BlackWhite.png": require("!!loader!./img/BlackWhite.png")');
    // 映射条目数 = 去重后的素材数（3 次引用 → 2 条目）
    expect((out.match(/: require\(/g) || []).length).toBe(2);
    expect(collectAssetRefs(out)).toEqual([]);
  });

  it('无素材引用时原样返回（不阻断构建、不插入无用头）', () => {
    const plain = 'module.exports = 1;';
    expect(rewriteToAssetMap(plain, () => 'x')).toBe(plain);
    expect(rewriteAssetRefs(plain, () => 'x')).toBe(plain);
  });

  it('幂等：对已改写内容再次处理不再变化', () => {
    const once = rewriteToAssetMap(BUNDLE, (p) => `require("!!loader!./${p}")`);
    const twice = rewriteToAssetMap(once, (p) => `require("!!loader!./${p}")`);
    expect(twice).toBe(once);
  });

  it('ASSET_URL_RE 为全局正则源（导出供适配层复用）', () => {
    expect(typeof ASSET_URL_RE.source).toBe('string');
  });
});
