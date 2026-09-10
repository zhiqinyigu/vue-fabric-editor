/*
 * 变量占位补丁（编辑器画布与渲染器共用的单一事实源）
 *
 * 语义：`fabric.Image.fromObject` 加载的变量图（src 仍为 `{{key}}` 字面量）→
 * 加载占位底图（灰底，规格见 variablePlaceholder.js）→ 还原存储 src 为变量 URL →
 * 挂载矢量叠加层（边框 + 变量名，见 objects/VariableImage.js）。tile 变量背景
 * （rect + pattern.source 为变量 URL）同样处理。渲染器与编辑器共用同一实现，
 * 保证"原样/编辑态"表现一致。
 *
 * 触发判据仅"src 仍是变量字面量"：
 * - 数据模式经 renderObjects 替换后 token 已消失（缺值→空串），不会命中；
 * - 已解析为真实 URL 的对象（可能残留 isVariableImage 标记）也不命中，
 *   避免同一标记在数据模式下被误劫持成占位（历史泄漏点）。
 *
 * 幂等：重复安装（编辑器 + 渲染器同进程）只包装一次；delimiter 解析器可后到更新。
 */
import { fabric } from 'fabric';
import { DEFAULT_DELIMITER, containsVariable } from './variableEngine';
import { attachVariableOverlay } from './objects/VariableImage';
import {
  makeVariablePlaceholderDataUrl,
  extractVariableLabel as sharedExtractVariableLabel,
} from './variablePlaceholder';

let installed = false;
// delimiter 解析器：支持动态取值（编辑器 delimiter 可在导入 JSON 后变更）
let delimiterResolver = () => DEFAULT_DELIMITER;

function resolveDelimiter() {
  try {
    return typeof delimiterResolver === 'function' ? delimiterResolver() : delimiterResolver;
  } catch (e) {
    return DEFAULT_DELIMITER;
  }
}

// 生成"动态变量占位图"（规格统一在 variablePlaceholder.js）
export function makeVariablePlaceholder() {
  return makeVariablePlaceholderDataUrl();
}

// 从变量 URL 提取叠加层显示的变量名（如 "user.id"），多个变量用 ", " 连接
export function extractVariableLabel(src, delimiter) {
  return sharedExtractVariableLabel(src, delimiter || resolveDelimiter());
}

// 序列化（toObject/toJSON）时，变量图应输出存储的变量 URL，而非占位图 dataURL
//（fabric.Image.getSrc 默认取 DOM 元素 src，即占位图 base64）
export function patchVariableImageGetSrc(imgEl) {
  imgEl.getSrc = function (filtered) {
    if (
      (this.get('isVariableImage') === true || this.get('isVariableBackground') === true) &&
      typeof this.get('src') === 'string'
    ) {
      return this.get('src');
    }
    return fabric.Image.prototype.getSrc.call(this, filtered);
  };
  return imgEl;
}

// 幂等安装 fromObject 包装（Image + Rect）。delimiter 可传字符串/对象或取值函数；
// 已安装时仅更新解析器，不重复包装。
export function installVariablePlaceholderPatch(delimiter) {
  if (delimiter !== undefined) {
    delimiterResolver =
      typeof delimiter === 'function' ? delimiter : () => delimiter || DEFAULT_DELIMITER;
  }
  if (installed) return;
  installed = true;

  const originalImageFromObject = fabric.Image.fromObject;
  fabric.Image.fromObject = function patched(object, callback) {
    const delim = resolveDelimiter();
    const isVariableImage =
      !!object &&
      object.type === 'image' &&
      typeof object.src === 'string' &&
      containsVariable(object.src, delim);
    if (!isVariableImage) {
      return originalImageFromObject.call(this, object, callback);
    }
    const variableSrc = object.src;
    const placeholder = makeVariablePlaceholderDataUrl();
    return originalImageFromObject.call(
      this,
      { ...object, src: placeholder },
      (instance, isError) => {
        if (isError || !instance) {
          callback(instance, isError);
          return;
        }
        instance.set('src', variableSrc);
        instance.set('isVariableImage', true);
        instance.set('variableLabel', sharedExtractVariableLabel(variableSrc, delim));
        instance.set('showPlaceholderText', true);
        attachVariableOverlay(instance);
        patchVariableImageGetSrc(instance);
        callback.call(this, instance, false);
      }
    );
  };

  // 变量背景（tile pattern）：fill.source 含 {{token}} 的 rect 在 enliven 前把 pattern
  // 源换成占位底图 dataURL；变量 URL 保留在 src 标记上（与编辑器 WorkspacePlugin
  // 变量背景的呈现/序列化对称：getJson _stripBackgroundPatternSource 用 src 顶替 pattern 源）
  const originalRectFromObject = fabric.Rect.fromObject;
  fabric.Rect.fromObject = function patched(object, callback) {
    const delim = resolveDelimiter();
    const isVariableBackground =
      !!object &&
      object.type === 'rect' &&
      object.fill &&
      object.fill.type === 'pattern' &&
      typeof object.fill.source === 'string' &&
      containsVariable(object.fill.source, delim);
    if (!isVariableBackground) {
      return originalRectFromObject.call(this, object, callback);
    }
    const variableSrc = object.fill.source;
    const patchedObj = {
      ...object,
      src: typeof object.src === 'string' && object.src ? object.src : variableSrc,
      isVariableBackground: true,
      fill: { ...object.fill, source: makeVariablePlaceholderDataUrl() },
    };
    return originalRectFromObject.call(this, patchedObj, (instance, isError) => {
      if (isError || !instance) {
        callback(instance, isError);
        return;
      }
      instance.set('variableLabel', sharedExtractVariableLabel(variableSrc, delim));
      instance.set('showPlaceholderText', true);
      attachVariableOverlay(instance);
      callback.call(this, instance, false);
    });
  };
}

// 是否已安装（供测试/宿主自检）
export function isVariablePlaceholderPatchInstalled() {
  return installed;
}
