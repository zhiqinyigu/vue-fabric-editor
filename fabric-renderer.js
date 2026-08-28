/*
 * fabric-renderer 子路径兼容入口（webpack4 等旧构建器不识别 package.json "exports" 子路径，
 * 通过传统 node 解析到该文件再转发到 dist 内的渲染器产物）。
 * 新构建器（webpack5 / Vite）优先走 exports 字段，本文件作为兜底。
 */
module.exports = require('./dist/fabric-renderer/fabric-renderer.common.js');
