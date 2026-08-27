/*
 * @Author: cyc
 * @Date: 2026-08-27 11:12:28
 * @LastEditors: cyc
 * @LastEditTime: 2026-08-28 14:07:42
 * 共享资产工具：URL 规范化（编辑器与前台渲染器共用）
 * 注意：此类共享模块禁止引入 UI / 编辑相关依赖，保持 tree-shaking 友好。
 */
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