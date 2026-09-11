/**
 * fabric-renderer 类型定义（子路径 `@chenyican/vue-fabric-editor/fabric-renderer`）
 *
 * 前台只读渲染器：把「模板 JSON + 变量数据」渲染成画布，无编辑能力。
 */

import Vue, { Component } from 'vue';
import { FabricJson, FontAdapter, VariableDef } from './index';

/* ============ 组件 ============ */

/** 远程图片「按接入域名分片缓存」配置：默认 feDomain=location.hostname；传 false 关闭 */
export interface RendererCacheBustConfig {
  param?: string;
  getValue?: (...args: any[]) => string;
}

export interface RendererOptions {
  /** 变量分隔符；不传则取模板 variableMeta.delimiter，再回退默认分隔符 */
  delimiter?: { start: string; end: string };
  /** 二维码兜底内容 */
  defaultQrCodeData?: string;
  /** 变量表（与 schema prop 等价，prop 优先） */
  schema?: VariableDef[];
  /** 远程图片分片缓存；false 关闭 */
  cacheBust?: boolean | RendererCacheBustConfig;
  /**
   * 图片跨域策略，默认 'anonymous'：CORS 优先，失败自动回退为无 crossOrigin 以保显示
   * （此时画布被污染、导出受限）；置 null 直接无 crossOrigin；置 'strict' 严格 CORS（失败即不显示）。
   */
  crossOrigin?: string | null;
  [key: string]: unknown;
}

export interface FabricRendererProps {
  /** 编辑器输出的模板 JSON；字符串会自动 JSON.parse */
  json?: FabricJson | string | null;
  /** 变量数据，按点路径取值，如 { user: { name: '张三' } } */
  data?: Record<string, any>;
  /**
   * 变量表（可选），用于 defaultValue 回退。
   * 优先级：schema prop > options.schema > 模板内 variableMeta.schema（不做 merge）
   */
  schema?: VariableDef[] | null;
  /** 与编辑器同契约，渲染期消费 font.list() */
  adapters?: { font?: FontAdapter; [key: string]: unknown };
  options?: RendererOptions;
}

export interface FabricRendererReadyPayload {
  core: any;
  canvas: any;
}

export interface FabricRendererEvents {
  ready: FabricRendererReadyPayload;
  rendered: FabricRendererReadyPayload;
  error: Error;
  /** 资源加载失败（背景图 CORS / URL 失效）；默认仅 console.warn */
  'renderer-error': any;
}

/**
 * 渲染组件。按实际像素 1:1 显示（不缩放），容器不足时滚动查看；
 * `json` / `data`（深度）/ `schema` 变化自动重渲染，卸载时自动 destroy。
 */
export declare class FabricRenderer extends Vue {
  $props: FabricRendererProps;
  $emit(event: 'ready', payload: FabricRendererReadyPayload): this;
  $emit(event: 'rendered', payload: FabricRendererReadyPayload): this;
  $emit(event: 'error', error: Error): this;
  $emit(event: 'renderer-error', payload: any): this;
}

export default FabricRenderer;

/* ============ 渲染内核与插件 ============ */

/** 渲染内核（`new RendererCore(canvas, options)`） */
export declare class RendererCore {
  constructor(canvas: any, options?: { getFonts?: () => Promise<any>; defaultQrCodeData?: string; cacheBust?: boolean | RendererCacheBustConfig; crossOrigin?: string | null });
  canvas: any;
  loadJSON(json: FabricJson | string): Promise<void>;
  getPlugin<T = unknown>(name: string): T | undefined;
  on(event: string, cb: (...args: any[]) => void): void;
  off(event: string, cb?: (...args: any[]) => void): void;
  /** 画布是否已被跨域回退图片污染（污染后导出会受限） */
  isCanvasTainted(): boolean;
  destroy(): void;
}

export declare const ServersPlugin: any;
export declare const RendererWorkspacePlugin: any;
export declare const RendererAutoGrowPlugin: any;

/* ============ 共享纯函数 ============ */

export declare const fabric: any;

export declare function render(...args: any[]): any;
export declare function renderObjects(json: any, data: Record<string, any>, delimiter?: any): any;
export declare function extractVariables(...args: any[]): any;
export declare function extractVariablesFromString(...args: any[]): any;
export declare function getByPath(...args: any[]): any;
export declare function getVariableFieldOfObject(...args: any[]): any;
export declare function computeAutoGrowSize(...args: any[]): any;
export declare const DEFAULT_DELIMITER: { start: string; end: string };

/** 变量图渲染期布局（渲染器在图片就绪后自动执行，导出供宿主复用/测试） */
export declare function layoutVariableImages(...args: any[]): any;

export declare const VARIABLE_TYPES: any;
export declare function inferVariableType(...args: any[]): any;
export declare function normalizeVariableDef(...args: any[]): any;
export declare function normalizeVariableDefs(...args: any[]): any;
export declare function validateVariableDef(...args: any[]): any;
export declare function mergeVariableSchema(...args: any[]): any;
export declare function applySchemaDefaults(...args: any[]): any;
export declare function applySchemaDefaultsFlat(...args: any[]): any;
export declare function applySchemaExamplesFlat(...args: any[]): any;
export declare function resolveRenderSchema(...args: any[]): any;

export declare function normalizeAssetUrl(...args: any[]): any;
export declare function appendCacheBustParam(...args: any[]): any;

/** 带 CORS 回退的图片加载：crossOrigin 失败时去掉重试（画布会被污染） */
export declare function loadImageResilient(
  url: string,
  opts?: { crossOrigin?: string | null }
): Promise<HTMLImageElement>;

export declare function generateQrCodeDataURL(...args: any[]): Promise<string>;
export declare function generateBarcodeDataURL(...args: any[]): Promise<string>;
export declare function qrParamsToOption(...args: any[]): any;

export declare function normalizeDefaultFields(...args: any[]): any;
export declare function normalizeCanvasDefaults(...args: any[]): any;
export declare function stripDefaultFields(...args: any[]): any;
export declare function stripCanvasDefaults(...args: any[]): any;

export declare const OBJECT_DEFAULTS: Record<string, any>;
export declare function getDefaultsForType(...args: any[]): any;

export declare function computeBackgroundLayout(...args: any[]): any;
export declare function cloneWorkspaceAsClip(...args: any[]): any;
export declare function createBackgroundObject(...args: any[]): any;
export declare function replaceTilePatternSource(...args: any[]): any;

/** 便于组件类型标注：`Component` 与主入口同源 */
export type FabricRendererComponent = Component;
