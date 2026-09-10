/**
 * src/examples/** 拷贝可移植性护栏
 *
 * 背景：`src/examples/` 是「拷贝改造」示例，业务项目会把整个示例目录拷进自己的工程。
 * 库源码里的 `@/...` 别名在业务侧会指向业务自身 src，拷贝后必须改写为业务统一出口
 * （admin_frontend 的 `src/js/views/poster-editor/VueFabricEditorRuntime.js`）。若示例悄悄
 * 新增一个未登记、主包也没带出的 `@/` 内部导入，业务照抄即构建失败——本测试把该风险提前到
 * 主包 CI。
 *
 * 判定：扫描 src/examples/** 的静态 `@/` 导入，命中白名单外任何 specifier 即失败。
 * 白名单每一项都是「已知拷贝改写点」：新增前请先确认 (1) 主包已从 src/lib 出口带出该符号；
 * (2) 已在业务统一出口登记改写映射；然后 (3) 加入下方 ALLOWLIST。
 * 若某能力希望「照抄即用、零改写」，应像 admin/legacyPosterUtils.js 一样改为自包含实现。
 */
const fs = require('fs');
const path = require('path');

const EXAMPLES_DIR = path.resolve(__dirname, '../../src/examples');

// 已知拷贝改写点（specifier → 业务侧改写目标）。仅登记现存项，新增请走文件头注释的三步。
const ALLOWLIST = new Set([
  '@/hooks/useEditorContext', // → 运行时出口 / 业务 hooks
  '@/hooks/select', // → 运行时出口 / 业务 hooks
  '@/hooks/useI18n', // → 运行时出口 / 业务 hooks
  '@/lib/FabricEditor.vue', // → VueFabricEditorRuntime 默认导出
  '@/lib/FabricRenderer.vue', // → VueFabricEditorRuntime 具名 FabricRenderer
  '@/lib/renderer', // → 运行时出口（appendCacheBustParam 等）
  '@/core/variableEngine', // → 运行时出口（extractVariables 等）
  '@/core/imageLoader', // → 运行时出口（loadImageResilient 等）
  '@/mixins/user-mixins', // → 库仓库演示专用，业务需替换为自身实现
  '@/utils/network', // → 库仓库演示专用，业务需替换为自身实现
  '@/utils', // → 库仓库演示专用，业务需替换为自身实现
]);

const IMPORT_RE = /(?:from|require\(|^import)\s*['"](@\/[^'"]+)['"]/gm;

// 返回源码中命中白名单外的 @/ specifier（去重）
function findUnlistedImports(source) {
  const found = [];
  const seen = new Set();
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(source)) !== null) {
    const spec = m[1];
    if (ALLOWLIST.has(spec) || seen.has(spec)) continue;
    seen.add(spec);
    found.push(spec);
  }
  return found;
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(path.join(dir, entry.name), out);
    } else if (/\.(js|vue)$/.test(entry.name) && !/\.test\.js$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function collectViolations() {
  const violations = [];
  for (const file of walk(EXAMPLES_DIR, [])) {
    const source = fs.readFileSync(file, 'utf8');
    for (const spec of findUnlistedImports(source)) {
      violations.push(`${path.relative(EXAMPLES_DIR, file).replace(/\\/g, '/')} → ${spec}`);
    }
  }
  return violations;
}

describe('src/examples 拷贝可移植性护栏', () => {
  it('未登记的 @/ 内部导入会被识别（护栏自身有效性）', () => {
    expect(findUnlistedImports("import { x } from '@/core/variablePlaceholder';")).toEqual([
      '@/core/variablePlaceholder',
    ]);
    expect(findUnlistedImports("import '@/styles/index.less';")).toEqual(['@/styles/index.less']);
    expect(findUnlistedImports("const p = require('@/lib/renderer');")).toEqual([]);
    expect(findUnlistedImports('// 规格同 @/core/variablePlaceholder.js 的工厂')).toEqual([]);
  });

  it('示例目录不得出现未登记的 @/ 内部导入', () => {
    const violations = collectViolations();
    if (violations.length) {
      throw new Error(
        [
          '示例文件须可整体拷贝。发现未登记的 @/ 内部导入：',
          ...violations.map((v) => `  - ${v}`),
          '',
          '处理方式：',
          '  1) 能自包含就自包含（如 admin/legacyPosterUtils.js，零 @/ 依赖、照抄即用）；',
          '  2) 否则先确认主包已从 src/lib 出口带出该符号，并在业务统一出口',
          '     （如 VueFabricEditorRuntime.js）登记改写映射，然后加入本测试的 ALLOWLIST。',
        ].join('\n')
      );
    }
    expect(violations).toEqual([]);
  });
});
