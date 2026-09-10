/*
 * @Author: cyc
 * @Date: 2026-09-10 16:04:07
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-10 16:04:07
 * @Description: 变量 Schema（变量字典）纯函数层（编辑器与前台渲染端共用）
 *  - schema 由业务侧外部注入（adapter / api），只存在于会话态，不进模板 JSON
 *  - 取值/写入语义与 variableEngine 完全一致（先精确匹配顶层扁平 key，再点路径下钻）
 *  - 所有函数零依赖 fabric/vue，输入输出均为纯数据
 */
import { getValueByPath, setByPath } from './variableEngine';

export const VARIABLE_TYPES = Object.freeze(['text', 'image', 'qrcode', 'barcode']);

// 占位字段 → 变量类型（与 variableEngine.getVariableFieldOfObject 的字段枚举对应）
const FIELD_TYPE_MAP = Object.freeze({
  text: 'text',
  src: 'image',
  'extension.data': 'qrcode',
  'extension.value': 'barcode',
});

/**
 * 按占位字段推断变量类型（收编未定义变量时预填用）
 * @param {string} field 占位字段（text / src / extension.data / extension.value）
 * @returns {'text'|'image'|'qrcode'|'barcode'}
 */
function inferVariableType(field) {
  if (typeof field !== 'string') return 'text';
  return FIELD_TYPE_MAP[field] || 'text';
}

/**
 * 清洗注入的 VariableDef（容错业务侧脏数据）
 * - path 必须为非空字符串（trim 后），否则返回 null
 * - label 缺省回退为 path；未知 type 回退为 text
 * @param {object} def
 * @returns {object|null} 规范化后的新对象；非法输入返回 null
 */
function normalizeVariableDef(def) {
  if (!def || typeof def !== 'object') return null;
  const path = typeof def.path === 'string' ? def.path.trim() : '';
  if (!path) return null;
  return {
    path,
    label: typeof def.label === 'string' && def.label.trim() ? def.label.trim() : path,
    type: VARIABLE_TYPES.includes(def.type) ? def.type : 'text',
    example: typeof def.example === 'string' ? def.example : '',
    defaultValue: typeof def.defaultValue === 'string' ? def.defaultValue : '',
    description: typeof def.description === 'string' ? def.description : '',
  };
}
/**
 * 清洗并去重变量表（按 path 去重，首个保留，重复项 console.warn）
 * @param {Array} defs
 * @returns {Array<object>}
 */
function normalizeDefs(defs) {
  if (!Array.isArray(defs)) return [];
  const seen = new Set();
  const result = [];
  defs.forEach((def) => {
    const normalized = normalizeVariableDef(def);
    if (!normalized) return;
    if (seen.has(normalized.path)) {
      // eslint-disable-next-line no-console
      console.warn(`[variableSchema] 重复的变量 path 已忽略：${normalized.path}`);
      return;
    }
    seen.add(normalized.path);
    result.push(normalized);
  });
  return result;
}

/**
 * 面向「扁平映射表」的默认值补齐（编辑器测试数据 testData 专用）：
 * testData 以完整路径作顶层 key（如 { 'user.name': 'x' }），默认值也按扁平 key 写入，
 * 与 updateTestData 的写入约定一致（不引入嵌套结构，避免 UI 表格回显错位）。
 * @param {object} map 扁平映射表（path -> value）
 * @param {Array} defs
 * @returns {object} 新对象（浅拷贝，不污染入参）；已填值（含空串）不覆盖
 */
function applySchemaDefaultsFlat(map, defs) {
  const next = { ...(map && typeof map === 'object' ? map : {}) };
  (Array.isArray(defs) ? defs : []).forEach((def) => {
    if (!def || typeof def.path !== 'string' || !def.path) return;
    if (typeof def.defaultValue !== 'string' || def.defaultValue === '') return;
    if (next[def.path] === undefined || next[def.path] === null) {
      next[def.path] = def.defaultValue;
    }
  });
  return next;
}

/**
 * 面向「扁平映射表」的示例值预填（编辑器 schema 注入专用）：
 * 按 example 预填测试数据缺失 key（仅 undefined/null），已填值不覆盖；
 * 与 applySchemaDefaultsFlat 的区别：example 是「业务建议测试值」（注入时预填），
 * defaultValue 是「渲染回退值」（预览时补齐），预填时机与语义均不同。
 * @param {object} map 扁平映射表（path -> value）
 * @param {Array} defs
 * @returns {object} 新对象（浅拷贝，不污染入参）
 */
function applySchemaExamplesFlat(map, defs) {
  const next = { ...(map && typeof map === 'object' ? map : {}) };
  (Array.isArray(defs) ? defs : []).forEach((def) => {
    if (!def || typeof def.path !== 'string' || !def.path) return;
    if (typeof def.example !== 'string' || def.example === '') return;
    if (next[def.path] === undefined || next[def.path] === null) {
      next[def.path] = def.example;
    }
  });
  return next;
}

/**
 * 校验单个变量定义（编辑器新建/编辑表单与插件入口共用）
 * @param {object} def 待校验的变量定义
 * @param {object} [opts]
 *   - existingPaths?: string[] 已有 path 集合（查重）
 *   - delimiter?: { start, end } 当前包裹符（校验 path 不含包裹符字符）
 * @returns {{ valid: boolean, errors: string[] }} errors 为错误码：
 *   empty_path / path_whitespace / path_delimiter / path_duplicate / empty_label
 */
function validateVariableDef(def, opts = {}) {
  const errors = [];
  const path = def && typeof def.path === 'string' ? def.path.trim() : '';
  if (!path) {
    errors.push('empty_path');
  } else {
    if (/\s/.test(path)) errors.push('path_whitespace');
    const d =
      opts.delimiter && opts.delimiter.start && opts.delimiter.end
        ? opts.delimiter
        : { start: '{{', end: '}}' };
    if (path.includes(d.start) || path.includes(d.end)) errors.push('path_delimiter');
    if (Array.isArray(opts.existingPaths) && opts.existingPaths.includes(path)) {
      errors.push('path_duplicate');
    }
  }
  const label = def && typeof def.label === 'string' ? def.label.trim() : '';
  if (!label) errors.push('empty_label');
  return { valid: errors.length === 0, errors };
}

/**
 * 变量表与模板扫描结果对齐（对齐视图的数据来源）
 * @param {Array} defs 注入的变量表 VariableDef[]
 * @param {Array} scannedEntries 画布扫描结果 [{ path, field }]
 * @returns {{
 *   defined: Array<{ path,label,type,example,defaultValue,description, used: boolean, fields: string[] }>,
 *   unknown: Array<{ path, fields: string[], suggestedType }>
 * }}
 * - defined：schema 变量 + 是否被模板使用（used）+ 使用的占位字段列表（fields）
 * - unknown：模板中存在但 schema 未定义的占位符（收编候选），suggestedType 按首个字段推断
 */
function mergeVariableSchema(defs, scannedEntries) {
  const normalized = normalizeDefs(defs);
  // 扫描结果按 path 聚合字段（同一变量可能同时用于文本与图片 URL）
  const scanned = new Map();
  (Array.isArray(scannedEntries) ? scannedEntries : []).forEach((entry) => {
    if (!entry || typeof entry.path !== 'string' || !entry.path) return;
    if (!scanned.has(entry.path)) scanned.set(entry.path, []);
    if (typeof entry.field === 'string' && entry.field) {
      const fields = scanned.get(entry.path);
      if (!fields.includes(entry.field)) fields.push(entry.field);
    }
  });
  const defined = normalized.map((def) => ({
    ...def,
    used: scanned.has(def.path),
    fields: scanned.get(def.path) || [],
  }));
  const definedPaths = new Set(normalized.map((d) => d.path));
  const unknown = [];
  scanned.forEach((fields, path) => {
    if (!definedPaths.has(path)) {
      unknown.push({ path, fields, suggestedType: inferVariableType(fields[0]) });
    }
  });
  return { defined, unknown };
}

/**
 * 按变量表补齐数据默认值（编辑器预览与 C 端渲染共用，保证两端一致）
 * - 仅当 defaultValue 为非空字符串且 data 中该 path 缺失（undefined/null）时写入
 * - data 已有值（含空串）一律不覆盖
 * - 返回新对象，不污染入参；无需补齐时原样返回入参引用（零拷贝）
 * @param {object} data 变量数据（扁平映射表或嵌套对象均可）
 * @param {Array} defs
 * @returns {object}
 */ function applySchemaDefaults(data, defs) {
  const source = data && typeof data === 'object' ? data : {};
  const list = Array.isArray(defs) ? defs : [];
  const fills = [];
  list.forEach((def) => {
    if (!def || typeof def.path !== 'string' || !def.path) return;
    if (typeof def.defaultValue !== 'string' || def.defaultValue === '') return;
    if (getValueByPath(source, def.path) == null) fills.push(def);
  });
  if (fills.length === 0) return source;
  let target;
  try {
    target = JSON.parse(JSON.stringify(source));
  } catch (e) {
    target = { ...source }; // 循环引用等极端场景：退化为浅拷贝
  }
  fills.forEach((def) => {
    setByPath(target, def.path, def.defaultValue);
  });
  return target;
}

/**
 * C 端渲染 schema 解析优先级：
 * 显式注入（props.schema / options.schema）完全优先（不 merge），
 * 未注入时回读模板自带 variableMeta.schema（完整/精简导出均携带）。
 * @param {object|null} rawJson 模板 JSON（读取 variableMeta.schema 快照）
 * @param {Array|null} propSchema 显式注入（FabricRenderer props.schema）
 * @param {Array|null} optionsSchema options.schema
 * @returns {Array|null} 变量表定义；无可用量返回 null（零开销跳过默认值回退）
 */
function resolveRenderSchema(rawJson, propSchema, optionsSchema) {
  if (Array.isArray(propSchema) && propSchema.length) return propSchema;
  if (Array.isArray(optionsSchema) && optionsSchema.length) return optionsSchema;
  const meta = rawJson && rawJson.variableMeta;
  if (meta && Array.isArray(meta.schema) && meta.schema.length) return meta.schema;
  return null;
}

export {
  inferVariableType,
  normalizeVariableDef,
  normalizeDefs as normalizeVariableDefs,
  validateVariableDef,
  mergeVariableSchema,
  applySchemaDefaults,
  applySchemaDefaultsFlat,
  applySchemaExamplesFlat,
  resolveRenderSchema,
};
