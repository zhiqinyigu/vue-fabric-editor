/*
 * @Author: cyc
 * @Date: 2026-08-27 11:05:58
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-01 10:27:16
 * @Description: 模板变量引擎（纯函数，编辑器与前台用户端共用）
 *  - 占位符包裹符（delimiter）可配置，默认 {{ }}；所有函数可传入覆盖
 *  - 取值规则：按点路径取 data；变量缺失 / null / undefined 一律替换为空字符串 ''
 */
const DEFAULT_DELIMITER = Object.freeze({ start: '{{', end: '}}' });

// 缓存：key = `${start}\u0000${end}\u0000${text}` -> token 列表
const compileCache = new Map();
const MAX_CACHE = 1000;

// 不同对象类型对应的"可变量字段"
function getVariableFieldsByType(type) {
  if (type === 'textbox' || type === 'i-text' || type === 'text' || type === 'text-path') {
    return ['text'];
  }
  if (type === 'image') {
    return ['src'];
  }
  return [];
}

// 扩展内容字段：二维码/条形码的内容保存在 extension 子字段（而非 src）
const EXTENSION_FIELD = {
  qrcode: 'extension.data',
  barcode: 'extension.value',
};

// 对象感知的"可变量字段"（支持 qrcode/barcode 的 extension 嵌套字段）
// 优先级：扩展内容字段 > 按 type 的常规字段；供收集/渲染统一使用
function getVariableFieldOfObject(obj) {
  if (!obj || typeof obj !== 'object') return [];
  const extField = obj.extensionType && EXTENSION_FIELD[obj.extensionType];
  if (extField) return [extField];
  return getVariableFieldsByType(obj.type);
}

// 点路径取值（安全）：支持 "extension.data" 这类嵌套路径
function getByPath(obj, path) {
  if (!obj || typeof obj !== 'object' || typeof path !== 'string') return undefined;
  const segments = path.split('.');
  let current = obj;
  for (let i = 0; i < segments.length; i++) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[segments[i]];
  }
  return current;
}

// 点路径赋值（安全）：支持 "extension.data"，中间对象缺失时自动创建，返回是否写入成功
function setByPath(obj, path, value) {
  if (!obj || typeof obj !== 'object' || typeof path !== 'string') return false;
  const segments = path.split('.');
  let current = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    if (current == null || typeof current !== 'object') return false;
    const seg = segments[i];
    if (current[seg] == null || typeof current[seg] !== 'object') {
      current[seg] = {};
    }
    current = current[seg];
  }
  const last = segments[segments.length - 1];
  if (current == null || typeof current !== 'object') return false;
  current[last] = value;
  return true;
}

function normalizeDelimiter(delimiter) {
  if (delimiter && delimiter.start !== undefined && delimiter.end !== undefined) {
    return delimiter;
  }
  return DEFAULT_DELIMITER;
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 编译字符串为 token 列表（含缓存）
function compile(text, delimiter) {
  if (typeof text !== 'string') return [];
  const d = normalizeDelimiter(delimiter);
  const cacheKey = `${d.start}\u0000${d.end}\u0000${text}`;
  if (compileCache.has(cacheKey)) {
    return compileCache.get(cacheKey);
  }
  const regex = new RegExp(
    `${escapeRegExp(d.start)}\\s*([\\s\\S]*?)\\s*${escapeRegExp(d.end)}`,
    'g'
  );
  const tokens = [];
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    const path = match[1].trim();
    if (path) {
      tokens.push({ type: 'var', path });
    } else {
      tokens.push({ type: 'text', value: match[0] });
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) });
  }
  if (compileCache.size >= MAX_CACHE) {
    compileCache.delete(compileCache.keys().next().value);
  }
  compileCache.set(cacheKey, tokens);
  return tokens;
}

// 判断字符串是否包含变量占位符
function containsVariable(text, delimiter) {
  if (typeof text !== 'string') return false;
  return compile(text, delimiter).some((t) => t.type === 'var');
}

// 按点路径取值（基础校验，避免原型链访问）
// 优先精确匹配完整路径作为顶层 key（如测试数据映射表 { 'user.name': 'x' }），
// 其次按点路径逐级取值（如 { user: { name: 'x' } }）
function getValueByPath(data, path) {
  if (!data || typeof data !== 'object') return undefined;
  const key = String(path);
  if (Object.prototype.hasOwnProperty.call(data, key)) {
    return data[key];
  }
  const segments = key.split('.');
  let current = data;
  for (let i = 0; i < segments.length; i++) {
    if (current == null || typeof current !== 'object') return undefined;
    const seg = segments[i];
    // 阻止访问原型链属性
    if (!Object.prototype.hasOwnProperty.call(current, seg)) return undefined;
    current = current[seg];
  }
  return current;
}

// 渲染单个字符串：缺失 / null / undefined 一律替换为空串
function render(text, data, delimiter) {
  if (typeof text !== 'string') return text;
  const tokens = compile(text, delimiter);
  if (tokens.every((t) => t.type === 'text')) return text;
  let result = '';
  for (const token of tokens) {
    if (token.type === 'text') {
      result += token.value;
    } else {
      const value = getValueByPath(data, token.path);
      result += value == null ? '' : String(value);
    }
  }
  return result;
}

// 从字符串提取去重后的变量路径列表
function extractVariablesFromString(text, delimiter) {
  if (typeof text !== 'string') return [];
  const set = new Set();
  compile(text, delimiter).forEach((t) => {
    if (t.type === 'var') set.add(t.path);
  });
  return Array.from(set);
}

// 递归收集整个 JSON（含 group.objects）里的变量路径
function collectVariablePaths(obj, delimiter, result) {
  if (!obj || typeof obj !== 'object') return result;
  const fields = getVariableFieldOfObject(obj);
  for (const field of fields) {
    const value = getByPath(obj, field);
    if (typeof value === 'string') {
      extractVariablesFromString(value, delimiter).forEach((p) => result.add(p));
    }
  }
  if (Array.isArray(obj.objects)) {
    obj.objects.forEach((child) => collectVariablePaths(child, delimiter, result));
  }
  return result;
}

// 提取模板 JSON 里所有用到的变量路径
function extractVariables(json, delimiter) {
  const result = new Set();
  if (Array.isArray(json)) {
    json.forEach((item) => collectVariablePaths(item, delimiter, result));
  } else {
    collectVariablePaths(json, delimiter, result);
  }
  return Array.from(result);
}

// 深拷贝并替换 text / src
function renderObjects(json, data, delimiter) {
  if (!json || typeof json !== 'object') return json;
  const copy = JSON.parse(JSON.stringify(json));
  applyRender(copy, data, delimiter);
  return copy;
}

function applyRender(obj, data, delimiter) {
  if (!obj || typeof obj !== 'object') return;
  const fields = getVariableFieldOfObject(obj);
  for (const field of fields) {
    const value = getByPath(obj, field);
    if (typeof value === 'string') {
      setByPath(obj, field, render(value, data, delimiter));
    }
  }
  if (Array.isArray(obj.objects)) {
    obj.objects.forEach((child) => applyRender(child, data, delimiter));
  }
}

export {
  DEFAULT_DELIMITER,
  compile,
  containsVariable,
  getValueByPath,
  render,
  extractVariablesFromString,
  extractVariables,
  renderObjects,
  getVariableFieldsByType,
  getVariableFieldOfObject,
  getByPath,
  setByPath,
};
