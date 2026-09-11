/*
 * @Author: cyc
 * @Date: 2026-08-27 11:12:28
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-10 16:04:07
 * fabric-renderer 包入口（轻量渲染器，无编辑能力）
 * 仅导出渲染所需内核与共享纯函数，便于 tree-shaking；
 * 不引入 Editor / 交互插件 / UI 组件。
 */
import { fabric } from 'fabric';

// 渲染组件（canvas 容器 + RendererCore 封装）
import FabricRenderer from './FabricRenderer.vue';

export { fabric };
export default FabricRenderer;
export { FabricRenderer };

// 渲染引擎
export { default as RendererCore } from '@/core/RendererCore';
export { default as ServersPlugin } from '@/core/ServersPlugin';
export { default as RendererWorkspacePlugin } from '@/core/plugin/RendererWorkspacePlugin';
export { default as RendererAutoGrowPlugin } from '@/core/plugin/RendererAutoGrowPlugin';

// 共享纯函数（渲染依赖）
export {
  render,
  renderObjects,
  extractVariables,
  extractVariablesFromString,
  getByPath,
  getVariableFieldOfObject,
  computeAutoGrowSize,
  DEFAULT_DELIMITER,
} from '@/core/variableEngine';
// 变量图渲染期布局（渲染器在图片就绪后自动执行；导出供宿主复用/测试）
export { layoutVariableImages } from '@/core/variableImageFit';
export { normalizeAssetUrl, appendCacheBustParam } from '@/core/assetUrl';
// 带 CORS 回退的图片加载：crossOrigin 请求失败自动去掉 crossOrigin 重试（保显示，
// 代价是画布被污染、导出受限）；供宿主自行加载/测量图片时复用
export { loadImageResilient } from '@/core/imageLoader';
export { generateQrCodeDataURL, generateBarcodeDataURL, qrParamsToOption } from '@/core/generators';
export {
  normalizeDefaultFields,
  normalizeCanvasDefaults,
  stripDefaultFields,
  stripCanvasDefaults,
} from '@/core/jsonOptimizer';
export { OBJECT_DEFAULTS, getDefaultsForType } from '@/core/objectDefaults';
export {
  computeBackgroundLayout,
  cloneWorkspaceAsClip,
  createBackgroundObject,
  replaceTilePatternSource,
} from '@/core/workspaceGeometry';
