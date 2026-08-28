/*
 * @Author: cyc
 * @Date: 2026-08-27 11:12:28
 * @LastEditors: cyc
 * @LastEditTime: 2026-08-28 10:25:25
 * 画布 JSON 优化器（编辑器与前台渲染器共用，纯函数）
 * - stripDefaultFields   ：剔除等于默认值的字段（保存/导出时，减小 JSON 体积）
 * - normalizeDefaultFields：补回缺省字段（加载/渲染时，保证 1:1 还原）
 * 两端共用 objectDefaults 表，保证"编辑器精简 + 渲染器补齐"双向契约一致。
 */
import { getDefaultsForType } from './objectDefaults';
import {
  isRemoteHttpUrl,
  appendCacheBustParam,
  removeCacheBustParam,
  DEFAULT_CACHE_BUST_PARAM,
} from './assetUrl';

function isEqual(a, b) {
  if (a === b) return true;
  // 数组/对象默认值（styles: [] / filters: []）按序列化比较，避免引用比较误判
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

function cloneDefault(value) {
  return Array.isArray(value) ? value.slice() : value;
}

export function stripDefaultFields(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const defaults = getDefaultsForType(obj.type);
  Object.keys(defaults).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(obj, key) && isEqual(obj[key], defaults[key])) {
      delete obj[key];
    }
  });
  if (Array.isArray(obj.objects)) obj.objects.forEach((child) => stripDefaultFields(child));
  if (obj.clipPath && typeof obj.clipPath === 'object') stripDefaultFields(obj.clipPath);
  return obj;
}

export function normalizeDefaultFields(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const defaults = getDefaultsForType(obj.type);
  Object.keys(defaults).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      obj[key] = cloneDefault(defaults[key]);
    }
  });
  if (Array.isArray(obj.objects)) obj.objects.forEach((child) => normalizeDefaultFields(child));
  if (obj.clipPath && typeof obj.clipPath === 'object') normalizeDefaultFields(obj.clipPath);
  return obj;
}

// 对画布 JSON（{ version, objects: [...] }）递归处理
export function stripCanvasDefaults(json) {
  if (json && Array.isArray(json.objects)) json.objects.forEach((o) => stripDefaultFields(o));
  return json;
}

export function normalizeCanvasDefaults(json) {
  if (json && Array.isArray(json.objects)) json.objects.forEach((o) => normalizeDefaultFields(o));
  return json;
}

// 系统层对象（workspace / 背景图）运行态只读属性。
// evented/lockMovement/hoverCursor 不随 JSON 持久化（或历史快照未含），恢复后回退 fabric
// 默认值会导致系统层重新响应鼠标（背景图像普通图片一样可命中/可编辑）。
// 历史记录 undo/redo 等不走 loadJSON 管线（无 hookImportAfter 兜底）的加载路径在恢复前调用。
// 属性集与 workspaceGeometry.createBackgroundObject 的 base / WorkspacePlugin.hookImportAfter 保持一致。
export function enforceSystemObjectsReadonly(json) {
  if (!json || !Array.isArray(json.objects)) return json;
  json.objects.forEach((o) => {
    if (!o || typeof o !== 'object') return;
    if (o.id === 'workspace' || o.id === 'backgroundImage') {
      o.selectable = false;
      o.evented = false;
      o.hasControls = false;
      o.hoverCursor = 'default';
      o.lockMovementX = true;
      o.lockMovementY = true;
    }
  });
  return json;
}

// 给 http(s)/协议相对的远程图片补 crossOrigin（已显式设置的保持不变；data: 不需要）。
// 避免 canvas 被远程图片污染（Tainted canvas）导致 toDataURL 导出 SecurityError。
// 编辑器与前台渲染器共用，保证两端加载远程图行为一致。
export function patchImageCrossOrigin(json, crossOrigin = 'anonymous') {
  if (!json || !Array.isArray(json.objects) || !crossOrigin) return json;
  const walk = (items) => {
    items.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      if (
        item.type === 'image' &&
        typeof item.src === 'string' &&
        /^(https?:)?\/\//i.test(item.src) &&
        item.crossOrigin == null
      ) {
        item.crossOrigin = crossOrigin;
      }
      if (Array.isArray(item.objects)) walk(item.objects);
    });
  };
  walk(json.objects);
  return json;
}

// 远程图片「按接入域名分片缓存」：递归给 objects 中远程 URL 追加分片参数。
// 覆盖 image 元素 src 与背景 tile 形态的 fill.source（pattern 序列化 URL）；
// data: / 变量占位符 / 已含同参数自动跳过（幂等）。仅请求态存在，保存端对称移除。
export function appendImagesCacheBustParam(json, config) {
  if (!json || !Array.isArray(json.objects)) return json;
  const walk = (items) => {
    items.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      if (isRemoteHttpUrl(item.src)) {
        item.src = appendCacheBustParam(item.src, config);
      }
      if (item.fill && isRemoteHttpUrl(item.fill.source)) {
        item.fill.source = appendCacheBustParam(item.fill.source, config);
      }
      if (Array.isArray(item.objects)) walk(item.objects);
    });
  };
  walk(json.objects);
  return json;
}

// 对称移除分片缓存参数（保存/导出前调用，存储态恢复干净 URL）
export function removeImagesCacheBustParam(json, param = DEFAULT_CACHE_BUST_PARAM) {
  if (!json || !Array.isArray(json.objects)) return json;
  const walk = (items) => {
    items.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      if (typeof item.src === 'string') {
        item.src = removeCacheBustParam(item.src, param);
      }
      if (item.fill && typeof item.fill.source === 'string') {
        item.fill.source = removeCacheBustParam(item.fill.source, param);
      }
      if (Array.isArray(item.objects)) walk(item.objects);
    });
  };
  walk(json.objects);
  return json;
}
