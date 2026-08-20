/**
 * 类型声明冒烟用例（仅类型检查，不参与运行 / 打包 / 发布）
 *
 * 位置说明：放在 tests/ 下而非 types/ 下，避免随 npm 包一起发布（package.json 的 files 只含 dist/types/... 声明文件）。
 *
 * 目的：以「消费方视角」使用 types/index.d.ts 与 types/fabric-renderer.d.ts 的公开面，
 * 让 `npm run typecheck` / CI 在声明与源码脱节时立刻失败。
 *
 * 覆盖：组件 Props / 事件载荷、adapters / extensions / options 契约、
 * 命令式 EditorApi 常用方法、插件具名导出、渲染器 Props / options / RendererCore。
 */
import Vue, { Component } from 'vue';

import FabricEditor, {
  FabricEditor as FabricEditorNamed,
  createI18n,
  Editor,
  WorkspacePlugin,
  type EditorAdapters,
  type EditorApi,
  type EditorExtension,
  type EditorOptions,
  type FabricEditorProps,
  type FabricEditorReadyPayload,
  type FabricEditorSaveRequestPayload,
  type FabricJson,
  type VariableDef,
} from '../../types/index';

import FabricRenderer, {
  RendererCore,
  type FabricRendererProps,
  type RendererOptions,
} from '../../types/fabric-renderer';

/* ---------- 编辑器：adapters 契约 ---------- */

const variables: VariableDef[] = [
  { path: 'user.name', label: '姓名', type: 'text', defaultValue: '默认姓名' },
  { path: 'user.bg', label: '背景图', type: 'image' },
];

const adapters: EditorAdapters = {
  font: { list: () => Promise.resolve([{ name: '思源黑体', file: 'https://x/f.woff' }]) },
  size: {
    list: () => Promise.resolve([{ id: 1, name: '海报', width: 400, height: 600, unit: 'px' }]),
  },
  variable: {
    list: () => Promise.resolve(variables),
    save: (defs) => Promise.resolve(void defs),
  },
  customAdapter: { anything: true },
};

/* ---------- 编辑器：extensions 契约 ---------- */

const DemoPanel: Component = { template: '<div>demo</div>' };

const extensions: EditorExtension[] = [
  {
    id: 'demo',
    services: { template: { list: () => Promise.resolve([]) } },
    panels: [
      { region: 'left', tab: { key: 'demo', label: '示例', icon: 'md-apps' }, component: DemoPanel },
    ],
    overrides: [{ component: 'TopbarImport', with: DemoPanel }],
    lifecycle: {
      onReady(ctx) {
        ctx.api.getVariableSchema();
        ctx.t('elements');
      },
      onDestroy(ctx) {
        void ctx.options;
      },
    },
  },
];

/* ---------- 编辑器：options 与 Props ---------- */

const options: EditorOptions = {
  showSaveButton: true,
  messageDuration: 0,
  workspace: { width: 800, height: 600 },
  cacheBust: { param: 'feDomain', getValue: () => 'host-a' },
  useAssetManifest: false,
};

const editorProps: FabricEditorProps = {
  adapters,
  extensions,
  options,
  remoteImageMode: false,
  defaultText: '新建文本',
  defaultTextbox: '新建文本',
  defaultQrCodeData: 'https://example.com',
};

/* ---------- 编辑器：命令式 api ---------- */

function useApi(api: EditorApi): void {
  const json: FabricJson = { objects: [], variableMeta: { schema: variables } };
  api.loadJSON(json);
  api.loadJSON('{"objects":[]}');
  api.setSize(800, 600);
  api.getSize();
  api.exportFile('png', 2);
  api.undo();
  api.redo();
  api.clear();

  api.registerAdapter('custom', { any: true });
  api.hasAdapter('custom');
  api.registerComponent('TopbarImport', DemoPanel);
  api.registerExtension(extensions[0]);
  api.unregisterExtension('demo');

  api.on('variable:previewChange', (previewing: boolean) => void previewing);
  api.off('variable:previewChange');

  const workspacePlugin = api.getPlugin<{ name?: string }>('WorkspacePlugin');
  void workspacePlugin;

  api.setVariableSchema(variables);
  api.getVariableSchema();
  api.ensureVariableSchemaLoaded();
  api.addCustomVariable({ path: 'a.b', label: 'A', type: 'text' });
  api.updateCustomVariable('a.b', { label: 'B' });
  api.removeCustomVariable('a.b');
  api.isImportedVariable('a.b');
  api.saveVariableSchema();
  api.exportVariableSchema();
  api.getVariableEntries();
}

/* ---------- 编辑器：事件载荷 ---------- */

function onReady(payload: FabricEditorReadyPayload): FabricJson {
  void payload.editor;
  void payload.canvas;
  return payload.api.getJSON();
}

function onSaveRequest(payload: FabricEditorSaveRequestPayload): FabricJson {
  return payload.json;
}

/* ---------- 编辑器：具名导出 / i18n / 插件 install ---------- */

void Editor;
void WorkspacePlugin;

const i18n = createI18n({ locale: 'zh', messages: { zh: { hello: '你好' } } });
void i18n;

// 静态 install 存在且签名正确（运行时 Vue.use(FabricEditor) 亦可用）
const install: typeof FabricEditor.install = FabricEditor.install;
void install;

const app = new Vue({ render: (h) => h(FabricEditorNamed) });
void app;

/* ---------- 渲染器 ---------- */

const rendererOptions: RendererOptions = {
  delimiter: { start: '{', end: '}' },
  defaultQrCodeData: 'https://example.com',
  schema: variables,
  cacheBust: false,
  crossOrigin: null,
};

const rendererProps: FabricRendererProps = {
  json: { objects: [] },
  data: { user: { name: '张三' } },
  schema: variables,
  adapters: { font: { list: () => Promise.resolve([]) } },
  options: rendererOptions,
};

function useRendererCore(core: RendererCore): void {
  core.loadJSON({ objects: [] });
  core.on('renderer:error', (payload: unknown) => void payload);
  core.off('renderer:error');
  core.getPlugin('RendererWorkspacePlugin');
  core.destroy();
}

const rendererApp = new Vue({
  render: (h) =>
    h(FabricRenderer, {
      props: rendererProps,
      on: {
        ready: (payload: { core: unknown; canvas: unknown }) => void payload,
        rendered: () => undefined,
        error: (e: Error) => void e,
        'renderer-error': (payload: unknown) => void payload,
      },
    }),
});

/* ---------- 引用以上用例，避免编辑器提示未使用 ---------- */

void onReady;
void onSaveRequest;
void useApi;
void useRendererCore;
void editorProps;
void rendererApp;
