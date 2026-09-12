/**
 * @chenyican/vue-fabric-editor 类型定义（主入口）
 *
 * 约定：内置 UI 实际消费的能力（adapters / api / extensions）做强类型，
 * 引擎与插件的具名导出保持宽松（any），避免锁死内部实现。
 */

import Vue, { Component, PluginFunction } from 'vue';

/* ============ 内置适配器（固定契约） ============ */

export interface FontEntry {
  name: string;
  file?: string;
  img?: string;
  type?: string;
}

export interface FontAdapter {
  list(): Promise<FontEntry[]>;
}

export interface SizeEntry {
  id: string | number;
  name: string;
  width: number;
  height: number;
  unit: string;
}

export interface SizeAdapter {
  list(): Promise<SizeEntry[]>;
}

/**
 * 在线图片上传（L1 升级用）。业务实现上传本地图片到后台/CDN，返回在线地址。
 */
export interface AssetAdapter {
  uploadImage(file: File): Promise<{ url: string }>;
}

/* ============ 变量 Schema（变量字典） ============ */

export type VariableType = 'text' | 'image' | 'qrcode' | 'barcode';

/**
 * 变量定义（变量表条目）。会话态权威：业务后台（经 adapter/api 注入）
 * 或编辑器内新建；模板 JSON 持久化的是 variableMeta.schema 快照。
 */
export interface VariableDef {
  /** 变量路径，唯一键（如 course.name）。创建后不可修改（画布占位符的锚点） */
  path: string;
  /** 展示名（下拉主行 / 面板 / 插入菜单） */
  label: string;
  /** 变量类型：约束插入入口与防呆 */
  type: VariableType;
  /** 示例值：导入/收编时预填编辑器测试数据（预填来源，非运行时值） */
  example?: string;
  /** 渲染缺失时的回退值（编辑器预览与 C 端渲染共用） */
  defaultValue?: string;
  /** 帮助文案（下拉 / 面板悬浮展示） */
  description?: string;
}

/**
 * 变量表注入协议（业务无关）。业务实现 list 拉取全量变量表；
 * save 为全量保存（业务侧自 diff），未实现时编辑器仅提供「导出变量表 JSON」。
 */
export interface VariableSchemaAdapter {
  list(): Promise<VariableDef[]>;
  save?(defs: VariableDef[]): Promise<void>;
}

/** variableMeta.schema 快照条目（VariableDef 持久化形态 + 来源标记） */
export interface VariableMetaDef extends VariableDef {
  /** 快照来源：imported=业务注入（可编辑、不可删除）/ custom=编辑器内新建或画布合成（可编辑可删除） */
  src?: 'custom' | 'imported';
}

/**
 * 模板变量元数据（随模板 JSON 持久化，保存时由 VariablePlugin 派生）。
 * - 完整导出（saveJson 下载）：schema 为全量会话表快照，example 承载测试数据；
 * - 精简导出（剪贴板 / save-request 提交，面向 C 端渲染）：
 *   schema 仅含「已使用 ∧ 有非空 defaultValue」的 { path, defaultValue } 条目。
 */
export interface VariableMeta {
  version?: number;
  delimiter?: { start: string; end: string };
  /** 模板作用域的变量表快照 */
  schema?: VariableMetaDef[];
  /** @deprecated 旧契约变量清单，仅读取兼容 */
  variables?: { path?: string; name?: string; example?: string }[];
}

/** 预注册适配器：内置 font/size/asset/variable + 开放索引（其余能力由扩展/业务自定） */
export interface EditorAdapters {
  font?: FontAdapter;
  size?: SizeAdapter;
  asset?: AssetAdapter;
  /** 变量表（变量字典）注入 */
  variable?: VariableSchemaAdapter;
  [key: string]: unknown;
}

/* ============ 注册表 ============ */

export interface Registry {
  register<T = unknown>(key: string, value: T): () => void;
  get<T = unknown>(key: string): T | undefined;
  has(key: string): boolean;
  unregister(key: string): void;
  keys(): string[];
  onChange(cb: (e: { type: 'register' | 'unregister'; key: string }) => void): () => void;
}

/* ============ 编辑器配置 ============ */

/** 远程图片「按接入域名分片缓存」配置：默认 feDomain=location.hostname；传 false 关闭 */
export interface CacheBustConfig {
  param?: string;
  getValue?: (...args: any[]) => string;
}

export interface EditorOptions {
  /** 默认 true；false 则隐藏顶栏「清空 / 保存 / 提交」按钮（业务自持保存时使用） */
  showSaveButton?: boolean;
  /** 全局 Message 提示时长（秒）；0 表示不自动关闭。默认 5 */
  messageDuration?: number;
  /** 初始化画布尺寸；不传则由 WorkspacePlugin 按容器自适应 */
  workspace?: { width: number; height: number };
  /** 远程图片分片缓存；false 关闭。JSON 存储态始终为干净 URL */
  cacheBust?: boolean | CacheBustConfig;
  /** 开启资源清单去重（相同素材只存一份） */
  useAssetManifest?: boolean;
  [key: string]: unknown;
}

/* ============ 命令式 API ============ */

export interface FabricJson {
  version?: string;
  objects: Record<string, unknown>[];
  variableMeta?: VariableMeta;
  [key: string]: unknown;
}

export interface EditorApi {
  readonly editor: any;
  readonly canvas: any;

  /* ---- 画布操作 ---- */
  loadJSON(json: FabricJson | string): Promise<void>;
  getJSON(): FabricJson;
  setSize(w: number, h: number): void;
  getSize(): { width: number; height: number } | undefined;
  clear(): void;
  preview(): Promise<string>;
  exportFile(type?: 'json' | 'svg' | 'png', multiplier?: number): any;
  undo(): void;
  redo(): void;
  getSelectMode(): string;

  /* ---- 注册表 ---- */
  registerAdapter(key: string, value: unknown): () => void;
  getAdapter<T = unknown>(key: string): T | undefined;
  hasAdapter(key: string): boolean;
  registerComponent(key: string, component: Component): () => void;
  getComponent(key: string): Component | undefined;

  /* ---- 扩展 ---- */
  registerExtension(ext: EditorExtension): () => void;
  unregisterExtension(id: string): void;

  /* ---- 事件（EventEmitter 透传） ---- */
  on(event: string, cb: (...args: any[]) => void): void;
  off(event: string, cb?: (...args: any[]) => void): void;
  emit(event: string, payload?: unknown): void;

  /* ---- 插件 ---- */
  getPlugin<T = unknown>(name: string): T | undefined;

  /* ---- 变量表（schema，业务无关注入/消费面） ---- */
  /** 直接注入静态变量表（无 adapter 场景）；视为导入（不可删除） */
  setVariableSchema(defs: VariableDef[]): VariableDef[];
  getVariableSchema(): VariableDef[];
  /** 懒加载（adapter 场景）：幂等；失败 reject 由调用方降级 */
  ensureVariableSchemaLoaded(): Promise<VariableDef[]>;
  /** 自定义变量 CRUD（导入变量不可删除、可编辑；path 冲突/非法会被拒绝） */
  addCustomVariable(def: VariableDef): Promise<VariableDef[]>;
  updateCustomVariable(
    path: string,
    patch: Partial<Omit<VariableDef, 'path'>>
  ): Promise<VariableDef[]>;
  removeCustomVariable(path: string): Promise<VariableDef[]>;
  isImportedVariable(path: string): boolean;
  /** 保存到业务后台（adapter.save；未实现时 reject，改走导出） */
  saveVariableSchema(): Promise<VariableDef[]>;
  /** 导出变量表 JSON 字符串（交开发录入后台的对接兜底） */
  exportVariableSchema(): string;
  /** 画布扫描 [{ path, fields }]（对齐视图 / 收编数据源） */
  getVariableEntries(): { path: string; fields: string[] }[];
}

/* ============ 扩展 ============ */

export interface PanelDescriptor {
  /** 默认 left */
  region?: 'left' | 'right' | 'top';
  tab?: { key: string; label: string; icon?: string };
  component: Component;
}

export interface ToolbarDescriptor {
  group?: string;
  icon?: string;
  label?: string;
  action?: (...args: any[]) => void;
}

export interface ComponentOverride {
  /** 内置可覆盖组件 key，如 'TopbarImport' / 'tools' / 'layer' */
  component: string;
  with: Component;
}

export interface EditorExtension {
  /** 必填，唯一 */
  id: string;
  /** 左侧/右侧/顶部面板；注册即出现，注销即消失 */
  panels?: PanelDescriptor[];
  toolbar?: ToolbarDescriptor[];
  /** 自动注册进 adapter registry（随扩展注销而清理） */
  services?: Record<string, unknown>;
  /** UI 组件覆盖（L2） */
  overrides?: ComponentOverride[];
  lifecycle?: {
    onReady?(ctx: EditorContext): void;
    onDestroy?(ctx: EditorContext): void;
  };
}

/* ============ 上下文 ============ */

export interface EditorContext {
  canvas: any;
  editor: any;
  api: EditorApi;
  registry: Registry;
  ui: Registry;
  extensions: unknown;
  t: (key: string, ...args: any[]) => string;
  options: EditorOptions;
  remoteImageMode: boolean;
}

/** `provide` / `useEditorContext` 使用的注入 key（injection key） */
export declare const EditorContextKey: any;

/* ============ 组件 ============ */

export interface FabricEditorProps {
  adapters?: EditorAdapters;
  extensions?: EditorExtension[];
  options?: EditorOptions;
  /** 强制远程图片模式：禁用本地上传与「在线图转 base64」，图片一律以远程 URL 入库 */
  remoteImageMode?: boolean;
  /** 新建文本元素的默认内容 */
  defaultText?: string;
  /** 新建文本框元素的默认内容 */
  defaultTextbox?: string;
  /** 二维码元素的默认内容 */
  defaultQrCodeData?: string;
}

export interface FabricEditorReadyPayload {
  api: EditorApi;
  editor: any;
  canvas: any;
}

export interface FabricEditorSaveRequestPayload {
  json: FabricJson;
}

export interface FabricEditorEvents {
  ready: FabricEditorReadyPayload;
  'save-request': FabricEditorSaveRequestPayload;
}

/**
 * 编辑器组件。可用 `ref` 取 `api`：
 * `this.$refs.editor.api.loadJSON(json)`
 */
export declare class FabricEditor extends Vue {
  api: EditorApi;
  $props: FabricEditorProps;
  static install: PluginFunction<never>;
  $emit(event: 'ready', payload: FabricEditorReadyPayload): this;
  $emit(event: 'save-request', payload: FabricEditorSaveRequestPayload): this;
}

export default FabricEditor;

/* ============ 注册表 / 扩展 / API 工厂 ============ */

export declare function createRegistry(): Registry;
export declare function createAdapterRegistry(): Registry;
export declare function createUiRegistry(): Registry;
export declare function createExtensionManager(options: {
  registry: Registry;
  ui: Registry;
}): any;
export declare function createEditorApi(ctx: EditorContext): EditorApi;

/* ============ 上下文与 hooks ============ */

export declare function provideEditorContext(ctx: EditorContext): void;
export declare function useEditorContext(): EditorContext;

export declare function useSelect(): any;
export declare function useSelectListen(): any;
export declare function useCalculate(): any;
export declare function useTestData(): any;
export declare function useI18n(): { t: (key: string, ...args: any[]) => string };

/* ============ i18n ============ */

export interface CreateI18nOptions {
  locale?: string;
  fallbackLocale?: string;
  messages?: Record<string, Record<string, unknown>>;
}

export declare function createI18n(options?: CreateI18nOptions): any;
export declare const messages: Record<string, Record<string, unknown>>;

/* ============ 运行时单实例注入（跨打包器） ============ */

/**
 * 注入消费方的 `vue` / `@vue/composition-api` 单例。
 *
 * 用于消除依赖树存在多份副本时出现的
 * `_vm.$t is not a function`（两份 vue）与
 * `The setup binding property "..." is already declared`（两份 composition-api）。
 *
 * 建议在消费方入口（`main.js`）调用一次；重复调用幂等；未注入时回退为构建解析到的实例。
 */
export declare function installRuntime(options: {
  vue?: any;
  Vue?: any;
  compositionApi?: any;
  CompositionApi?: any;
  api?: any;
  /**
   * 非 webpack 打包器下的画布素材基址（字符串目录或 (relativePath) => url 函数）。
   * 需把包内 dist/vue-fabric-editor 下的素材托管到该基址。webpack 项目请改用 VfeAssetsPlugin。
   */
  assetsBaseUrl?: string | ((relativePath: string) => string);
}): boolean;

/** 是否已调用过 `installRuntime` 完成注入 */
export declare function isRuntimeInjected(): boolean;

/**
 * 单独设置画布素材基址（等价于 installRuntime({ assetsBaseUrl })）
 * @param baseUrl 目录字符串（自动补 /）、(relativePath) => url 函数，或 null 清除
 */
export declare function setCanvasAssetsBaseUrl(
  baseUrl: string | ((relativePath: string) => string) | null
): void;

/** 解析画布素材 URL（已配置基址时用基址拼装，否则返回 fallbackUrl） */
export declare function resolveCanvasAsset(relativePath: string, fallbackUrl?: string): string;

/* ============ 内置可覆盖组件（UI 注册表 key） ============ */

export declare const TopbarImport: Component;
export declare const RightPanel: Component;

/* ============ 引擎与插件具名导出（宽松类型） ============ */

export declare const Editor: any;
export declare const EventType: any;
export declare const Utils: any;
export declare const CustomRect: any;
export declare const CustomTextbox: any;

export declare const DringPlugin: any;
export declare const AlignGuidLinePlugin: any;
export declare const ControlsPlugin: any;
export declare const ControlsRotatePlugin: any;
export declare const CenterAlignPlugin: any;
export declare const LayerPlugin: any;
export declare const CopyPlugin: any;
export declare const MoveHotKeyPlugin: any;
export declare const DeleteHotKeyPlugin: any;
export declare const EscHotKeyPlugin: any;
export declare const GroupPlugin: any;
export declare const DrawLinePlugin: any;
export declare const GroupTextEditorPlugin: any;
export declare const GroupAlignPlugin: any;
export declare const WorkspacePlugin: any;
export declare const MaskPlugin: any;
export declare const HistoryPlugin: any;
export declare const FlipPlugin: any;
export declare const RulerPlugin: any;
export declare const MaterialPlugin: any;
export declare const WaterMarkPlugin: any;
export declare const FontPlugin: any;
export declare const PolygonModifyPlugin: any;
export declare const DrawPolygonPlugin: any;
export declare const FreeDrawPlugin: any;
export declare const PathTextPlugin: any;
export declare const PsdPlugin: any;
export declare const SimpleClipImagePlugin: any;
export declare const BarCodePlugin: any;
export declare const QrCodePlugin: any;
export declare const ImageStroke: any;
export declare const ResizePlugin: any;
export declare const LockPlugin: any;
export declare const AddBaseTypePlugin: any;
export declare const TextClipPlugin: any;
export declare const VariablePlugin: any;
export declare const AutoGrowPlugin: any;

export declare const RendererCore: any;
export declare const RendererWorkspacePlugin: any;
export declare const RendererAutoGrowPlugin: any;

/* ============ 共享纯函数 ============ */

export declare function render(...args: any[]): any;
export declare function renderObjects(json: any, data: Record<string, any>, delimiter?: any): any;
export declare function extractVariables(...args: any[]): any;
export declare function extractVariablesFromString(...args: any[]): any;
export declare function getByPath(...args: any[]): any;
export declare function getVariableFieldOfObject(...args: any[]): any;
export declare function computeAutoGrowSize(...args: any[]): any;
export declare const DEFAULT_DELIMITER: { start: string; end: string };

export declare function generateQrCodeDataURL(...args: any[]): Promise<string>;
export declare function generateBarcodeDataURL(...args: any[]): Promise<string>;
export declare function qrParamsToOption(...args: any[]): any;
export declare function normalizeAssetUrl(...args: any[]): any;
export declare function appendCacheBustParam(...args: any[]): any;

/** 带 CORS 回退的图片加载：crossOrigin 失败时去掉重试（画布会被污染） */
export declare function loadImageResilient(
  url: string,
  opts?: { crossOrigin?: string | null }
): Promise<HTMLImageElement>;
/** 包装 fabric.util.loadImage 使 loadJSON 全管线具备 CORS 回退（幂等） */
export declare function installImageCorsFallback(): void;
export declare function uninstallImageCorsFallback(): void;
export declare function setCorsFallbackEnabled(enabled?: boolean): void;
export declare function isCorsFallbackEnabled(): boolean;
export declare function getCorsBlockedOrigins(): string[];
export declare function addCorsFallbackListener(
  cb: (info: { url: string; origin: string }) => void
): () => void;
export declare function normalizeCrossOrigin(value?: string | null): string | null;
export declare function isStrictCrossOrigin(value?: string | null): boolean;
export declare const STRICT_CROSS_ORIGIN: 'strict';

export declare const OBJECT_DEFAULTS: Record<string, any>;
export declare function getDefaultsForType(...args: any[]): any;

export declare function stripDefaultFields(...args: any[]): any;
export declare function normalizeDefaultFields(...args: any[]): any;
export declare function stripCanvasDefaults(...args: any[]): any;
export declare function normalizeCanvasDefaults(...args: any[]): any;
export declare function patchImageCrossOrigin(...args: any[]): any;

export declare function computeBackgroundLayout(...args: any[]): any;
export declare function cloneWorkspaceAsClip(...args: any[]): any;
export declare function createBackgroundObject(...args: any[]): any;
export declare function replaceTilePatternSource(...args: any[]): any;
