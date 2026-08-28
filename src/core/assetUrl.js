/*
 * @Author: cyc
 * @Date: 2026-08-27 11:12:28
 * @LastEditors: cyc
 * @LastEditTime: 2026-08-28 14:07:42
 * 共享资产工具（编辑器与前台渲染器共用）
 * - normalizeAssetUrl：URL 规范化（保守策略）
 * - append/removeCacheBustParam：远程图片「按接入域名分片缓存」参数（feDomain=当前接入域名）
 *
 * 分片缓存背景：服务器可按白名单接入域名返回 access-control-allow-* 响应头放行跨域图片。
 * 请求 URL 追加 feDomain=<location.hostname> 后，CDN 按「完整 URL（含参数）」分片缓存：
 * 不同接入域名互不命中，既避开脏缓存，又允许各域名利用自己的合法缓存。
 * 参数仅在真实请求态存在（loadJSON / 插图 / 设背景），JSON 存储态保持干净 URL，
 * 保存时由 removeImagesCacheBustParam 对称移除。
 *
 * TODO(防盗链验签): 含签名参数的 CDN URL 追加分片参数后可能验签失败，
 * 服务端把分片参数纳入签名白名单前，签名 URL 的分片缓存策略待定。
 *
 * 注意：此类共享模块禁止引入 UI / 编辑相关依赖，保持 tree-shaking 友好。
 */
// 默认分片参数名：feDomain（前端接入域名），刻意避开常见 CDN/业务参数（v/t/ts/callback/domain/host 等）
export const DEFAULT_CACHE_BUST_PARAM = 'feDomain';

// 规范化资源 URL（保守策略，避免破坏 CDN 签名/参数）
// - trim 空白
// - 协议相对地址 //host/.. 补全为 https:
// - 其余（http(s) / data: / blob: / 相对路径 / 含变量占位符）保持原样
export function normalizeAssetUrl(url) {
  if (typeof url !== 'string') return url;
  let s = url.trim();
  if (!s) return s;
  if (s.indexOf('//') === 0) s = 'https:' + s;
  return s;
}

// 是否远程 http(s) 图片 URL（变量占位符 {{}} 排除，data:/blob:/相对路径排除）
export function isRemoteHttpUrl(url) {
  return typeof url === 'string' && /^(https?:)?\/\//i.test(url) && url.indexOf('{{') === -1;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 默认取值：当前接入域名；非浏览器/取不到返回空串（追加动作自动跳过）。
// 优先裸 location（浏览器全局），回退 window.location（jsdom 等无裸 location 的环境）。
function defaultCacheBustValue() {
  try {
    if (typeof location !== 'undefined' && location && location.hostname) {
      return location.hostname;
    }
  } catch (e) {
    // ignore
  }
  try {
    const w = typeof window !== 'undefined' ? window : null;
    if (w && w.location && w.location.hostname) {
      return w.location.hostname;
    }
  } catch (e) {
    // ignore
  }
  return '';
}

// 配置规范化：undefined→默认开启（feDomain + location.hostname）；false/null→关闭；{ param, getValue }→自定义
function normalizeCacheBustConfig(config) {
  if (config === false || config === null) return null;
  const cfg = config && typeof config === 'object' ? config : {};
  const param = typeof cfg.param === 'string' && cfg.param ? cfg.param : DEFAULT_CACHE_BUST_PARAM;
  const getValue = typeof cfg.getValue === 'function' ? cfg.getValue : defaultCacheBustValue;
  return { param, getValue };
}

// 给远程 URL 追加分片缓存参数（幂等：已存在同参数原样返回；保留 hash；值 encodeURIComponent）
export function appendCacheBustParam(url, config) {
  if (!isRemoteHttpUrl(url)) return url;
  const cfg = normalizeCacheBustConfig(config);
  if (!cfg) return url;
  const value = cfg.getValue();
  if (!value) return url;
  if (new RegExp('[?&]' + escapeRegExp(cfg.param) + '=', 'i').test(url)) return url;
  const hashIdx = url.indexOf('#');
  const base = hashIdx === -1 ? url : url.slice(0, hashIdx);
  const hash = hashIdx === -1 ? '' : url.slice(hashIdx);
  const sep = base.indexOf('?') === -1 ? '?' : '&';
  return base + sep + cfg.param + '=' + encodeURIComponent(String(value)) + hash;
}

// 移除分片缓存参数（与 append 对称；移除首个参数时把后续 & 还原为 ?；保留 hash）
export function removeCacheBustParam(url, param = DEFAULT_CACHE_BUST_PARAM) {
  if (typeof url !== 'string' || !url || !param) return url;
  const re = new RegExp('[?&]' + escapeRegExp(param) + '=[^&#]*', 'i');
  const m = url.match(re);
  if (!m) return url;
  let out = url.replace(re, '');
  if (m[0].charAt(0) === '?' && out.indexOf('?') === -1) {
    const hashIdx = out.indexOf('#');
    const ampIdx = out.indexOf('&');
    if (ampIdx !== -1 && (hashIdx === -1 || ampIdx < hashIdx)) {
      out = out.slice(0, ampIdx) + '?' + out.slice(ampIdx + 1);
    }
  }
  return out;
}
