/**
 * 变量表（schema）存储适配器 demo（adapters.variable 契约：list/save）
 *
 * 业务项目请替换为真实后端 KV 实现（list 按 keyStr 查记录解析 valueData，
 * save 先查后写避免撞唯一索引），本 demo 以 localStorage 模拟：
 * - 整张变量表以一条 KV 记录存储（valueData 为 JSON 字符串），保存为全量覆盖（last-write-wins）
 * - list()      按 keyStr 读记录并解析，返回变量定义数组（无记录/解析失败返回 []）
 * - save(defs)  全量写入
 *
 * pagePath/keyStr 由业务侧拼好后传入（本工厂不做拼接，无固定公式）：
 * 业务页经 Entry 的 variable-context prop → 交接 query（category/fieldId）→ 编辑器页注入本工厂。
 *
 * 用法（编辑器页，交接 query 契约 ?category=<pagePath>&fieldId=<keyStr>）：
 *   adapters.variable = createVariableSchemaAdapter({
 *     pagePath: this.$route.query.category,
 *     keyStr: this.$route.query.fieldId,
 *   });
 *
 * @param {Object}   keys            拼好的存储键（业务侧登记拼接规则）
 * @param {String}   keys.pagePath   页面分组（必填）
 * @param {String}   keys.keyStr     唯一索引（必填）
 * @returns {{ list: () => Promise<Array>, save: (defs: Array) => Promise<void> }}
 */
export function createVariableSchemaAdapter({ pagePath, keyStr }) {
  if (pagePath === undefined || pagePath === null || pagePath === '') {
    throw new Error('[variableSchemaAdapter] pagePath 不能为空（业务侧拼好后传入）');
  }
  if (keyStr === undefined || keyStr === null || keyStr === '') {
    throw new Error('[variableSchemaAdapter] keyStr 不能为空（业务侧拼好后传入）');
  }

  const STORE_PREFIX = 'fe:poster-variable-schema:';
  const storeKey = STORE_PREFIX + `${pagePath}~${keyStr}`;

  return {
    list() {
      const raw = localStorage.getItem(storeKey);
      if (!raw) return Promise.resolve([]);
      try {
        const defs = JSON.parse(raw);
        return Promise.resolve(Array.isArray(defs) ? defs : []);
      } catch (e) {
        console.warn('[variableSchemaAdapter] valueData JSON 解析失败', e);
        return Promise.resolve([]);
      }
    },
    // 全量保存（整表覆盖，last-write-wins）
    save(defs) {
      localStorage.setItem(storeKey, JSON.stringify(defs || []));
      return Promise.resolve();
    },
  };
}

export default createVariableSchemaAdapter;
