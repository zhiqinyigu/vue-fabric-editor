/*
 * 远程图片 CORS 回退加载（编辑器与前台渲染器共用）
 *
 * 背景：服务器未必返回 Access-Control-* 响应头。图片一旦带 crossOrigin='anonymous'，
 * 浏览器会把它升级为 CORS 请求：响应缺少 CORS 头时不是"显示但污染画布"，而是**直接判定
 * 加载失败（onerror）、图元根本拿不到**，表现为背景图整块消失。
 *
 * 策略：先按 crossOrigin 发 CORS 请求；onerror 时去掉 crossOrigin 重试，保证"能显示"。
 * 代价是回退后 canvas 被污染（tainted），toDataURL/toBlob 会抛 SecurityError —— 即"保显示、
 * 舍导出"，导出端需自行兜底（见 ServersPlugin.preview/saveImg 的 SecurityError 捕获）。
 *
 * - 按 origin 记忆失败结果，避免同一 CDN 的每张图都白跑一次失败的 CORS 请求。
 * - 包装 fabric.util.loadImage，覆盖 loadJSON / enlivenObjects / setSrc 全管线。
 * - 自定义 Image 加载点（背景图 setBackgroundImage）用 loadImageResilient。
 *
 * 关闭回退：options.crossOrigin = 'strict'（严格 CORS，失败即不显示，保持旧行为）。
 * 注意：此类共享模块禁止引入 UI / 编辑相关依赖，保持 tree-shaking 友好。
 */
import { fabric } from 'fabric';

// 严格模式取值：不做回退（保持"宁可白屏也不污染画布"的旧语义）
export const STRICT_CROSS_ORIGIN = 'strict';

// 已确认拿不到 CORS 头的 origin，后续直接跳过 CORS 请求
const corsBlockedOrigins = new Set();
// 回退发生时的全局监听（宿主可提示"画布已污染、导出受限"）
const fallbackListeners = new Set();
// 幂等安装标记（editor 与 renderer 都会调用，只包一层）
const INSTALLED = Symbol.for('vfe.imageCorsFallbackInstalled');

let fallbackEnabled = true;

// 归一化 crossOrigin 选项：undefined→'anonymous'；'strict'→'anonymous'（回退由开关控制）
export function normalizeCrossOrigin(value) {
  if (value === undefined || value === STRICT_CROSS_ORIGIN) return 'anonymous';
  return value;
}
// 是否严格模式（不回退）
export function isStrictCrossOrigin(value) {
  return value === STRICT_CROSS_ORIGIN;
}
// 由引擎按 options.crossOrigin 调用：'strict' 时关闭回退
export function setCorsFallbackEnabled(enabled) {
  fallbackEnabled = enabled !== false;
}
export function isCorsFallbackEnabled() {
  return fallbackEnabled;
}
export function getCorsBlockedOrigins() {
  return Array.from(corsBlockedOrigins);
}
// 回退发生回调；返回取消订阅函数
export function addCorsFallbackListener(cb) {
  if (typeof cb !== 'function') return () => {};
  fallbackListeners.add(cb);
  return () => fallbackListeners.delete(cb);
}
// 仅供测试重置内部状态
export function resetImageCorsFallbackForTest() {
  corsBlockedOrigins.clear();
  fallbackListeners.clear();
  fallbackEnabled = true;
}

function originOf(url) {
  try {
    const base = typeof location !== 'undefined' ? location.href : undefined;
    return new URL(url, base).origin;
  } catch (e) {
    return '';
  }
}
function isDataUrl(url) {
  return typeof url === 'string' && url.indexOf('data') === 0;
}
function notifyFallback(url, origin) {
  fallbackListeners.forEach((cb) => {
    try {
      cb({ url, origin });
    } catch (e) {
      // 监听器异常不影响加载主流程
    }
  });
}
function markBlocked(url, origin) {
  if (origin && !corsBlockedOrigins.has(origin)) {
    corsBlockedOrigins.add(origin);
    notifyFallback(url, origin);
  }
}

/**
 * 加载单张图片：CORS 优先，失败（且未关闭回退）时去掉 crossOrigin 重试。
 * @param {string} url 图片地址（调用方自行处理缓存分片参数）
 * @param {{crossOrigin?: string}} [opts]
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImageResilient(url, { crossOrigin = 'anonymous' } = {}) {
  return new Promise((resolve, reject) => {
    const origin = originOf(url);
    const useCrossFirst = !!crossOrigin && !isDataUrl(url) && !corsBlockedOrigins.has(origin);
    const attempt = (useCross) => {
      const img = new Image();
      // crossOrigin 必须在 src 之前赋值，否则不生效
      if (useCross) img.crossOrigin = crossOrigin;
      img.onload = () => resolve(img);
      img.onerror = () => {
        if (!useCross) {
          reject(new Error('image load failed: ' + url));
          return;
        }
        if (fallbackEnabled) {
          markBlocked(url, origin);
          attempt(false); // 回退：无 crossOrigin 重试
        } else {
          reject(new Error('CORS image load failed: ' + url));
        }
      };
      img.src = url;
    };
    attempt(useCrossFirst);
  });
}

/**
 * 包装 fabric.util.loadImage，使 loadJSON / enlivenObjects / setSrc 等所有经 fabric 的
 * 图片加载都具备 CORS 回退能力。幂等。
 */
export function installImageCorsFallback() {
  if (fabric.util[INSTALLED]) return;
  const original = fabric.util.loadImage;
  fabric.util[INSTALLED] = original;
  fabric.util.loadImage = function (url, callback, context, crossOrigin) {
    const origin = originOf(url);
    const skipCross = isDataUrl(url) || (fallbackEnabled && corsBlockedOrigins.has(origin));
    if (!crossOrigin || skipCross) {
      // 未指定 / data: / 已知不支持 CORS → 直接无 crossOrigin 加载
      return original.call(this, url, callback, context, skipCross ? null : crossOrigin);
    }
    const self = this;
    return original.call(
      this,
      url,
      function (img, isError) {
        if (isError && fallbackEnabled) {
          markBlocked(url, origin);
          original.call(self, url, callback, context, null); // 回退重试
          return;
        }
        callback && callback.call(context, img, isError);
      },
      context,
      crossOrigin
    );
  };
}

// 卸载包装（测试 / 热重载用）
export function uninstallImageCorsFallback() {
  if (!fabric.util[INSTALLED]) return;
  fabric.util.loadImage = fabric.util[INSTALLED];
  delete fabric.util[INSTALLED];
}
