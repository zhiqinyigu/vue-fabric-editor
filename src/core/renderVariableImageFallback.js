/*
 * 渲染器变量占位兜底（对外兼容壳，默认不启用）
 *
 * 实现已收敛到 variablePlaceholderPatch.js（编辑器画布与渲染器共用同一事实源）：
 * - 数据没填值的变量图/变量背景 → 编辑器同款占位（灰底 + 矢量叠加边框/变量名）
 * - 触发判据仅"src 仍为变量字面量"（模板模式）；数据模式替换后 token 消失，不命中
 *
 * 注册方式：
 * - RendererCore options.templateMode（兼容旧名 variablePlaceholder）=== true 时安装
 * - lib/renderer.js 导出本函数供宿主全局手工注册（幂等）
 */
export {
  installVariablePlaceholderPatch as installRenderVariableImageFallback,
  isVariablePlaceholderPatchInstalled as isRenderVariableImageFallbackInstalled,
} from './variablePlaceholderPatch';
