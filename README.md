# vue-fabric-editor（Vue 2 移植版）

基于 Vue 2.6 + Fabric.js 5 的图片/海报设计编辑器，移植自开源项目
[ikuaitu/vue-fabric-editor](https://github.com/ikuaitu/vue-fabric-editor)（以下简称"上游项目"，基于 Vue 3 + Vite 构建）。

> 许可：MIT（沿用上游协议，保留上游版权与作者声明）。详见 [LICENSE](./LICENSE) 与 [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)。

- **编辑器库**：`src/lib/index.js` → 构建产物 `dist/vue-fabric-editor/`（npm 入口，含 `FabricEditor` 组件与 `createI18n`）
- **前台渲染器**：`src/lib/renderer.js` → 构建产物 `dist/fabric-renderer/`（仅渲染能力，供用户端展示使用，不含编辑功能）
- **运行时扩展示例**：`src/examples/`（模板管理、在线图片、AI 工具等，供业务拷贝改造）

> 两个对外组件的完整 API（Props / Events / Slot / 命令式 api / 扩展协议）见文末 [组件文档](#组件文档)。

## 快速开始

```bash
npm install          # 安装依赖
npm run serve        # 启动开发站点（含 demo / legacy-demo 路由）
npm run build        # 构建应用站点
npm run build:lib    # 构建编辑器库 → dist/vue-fabric-editor/
npm run build:lib:renderer   # 构建前台渲染器 → dist/fabric-renderer/
npm test             # 运行 jest 测试
npm run typecheck    # 校验 types/*.d.ts（消费侧冒烟用例，见「组件文档 - 类型声明」）
npm run test:layer   # layer.vue 拖拽排序手动验证脚本（JSDOM + mock-env，独立于 jest）
```

## 最小消费工程示例

> 运行时可参考 `src/views/demo/index.vue`（仓库内 `/demo` 路由，引源码实时可跑）；本节面向消费者视角（引打包产物 + 独立入口）。

以下是最小消费工程的完整内容，展示业务项目如何接入**打包后**的 `@chenyican/vue-fabric-editor`。
真实业务项目中按此结构组织代码即可：

- 从 npm 安装 `@chenyican/vue-fabric-editor`（或直接引用本地 `dist/` 产物）
- 自行安装 peer 依赖：`vue`、`view-design`、`@vue/composition-api`、`fabric` 等（完整清单见 `package.json` 的 `peerDependencies`）
- 按需拷贝 `src/examples/` 下的扩展示例到自己的工程内，并按业务改造接口
- 业务自持路由、登录、CDN 上传等；编辑器只负责画布能力

### 入口 `main.js`

注册 peer 依赖、初始化 i18n、挂载应用：

```js
import Vue from 'vue';
import ViewUI from 'view-design';
import 'view-design/dist/styles/iview.css';
import VueCompositionAPI from '@vue/composition-api';
import { createI18n } from '@chenyican/vue-fabric-editor';
import '@chenyican/vue-fabric-editor/style'; // = dist/vue-fabric-editor/vue-fabric-editor.css
import App from './App.vue';

Vue.use(VueCompositionAPI);
Vue.use(ViewUI);

const i18n = createI18n();

new Vue({
  i18n,
  render: (h) => h(App),
}).$mount('#app');
```

### 外壳 `App.vue`

使用 `FabricEditor` 组件，传入 `adapters`（字体/尺寸等内置能力）与 `extensions`（业务扩展），处理 `ready` / `save-request` 事件；初始加载与持久化通过 URL 参数（`?tempId=` 加载模板、`?id=` 更新作品）由业务接管：

```vue
<template>
  <div style="height: 100vh; overflow: hidden">
    <FabricEditor
      ref="editor"
      :adapters="adapters"
      :extensions="extensions"
      @ready="onReady"
      @save-request="onSave"
    />
  </div>
</template>

<script>
import { ref } from '@vue/composition-api';
import { FabricEditor } from '@chenyican/vue-fabric-editor';
// 真实业务项目中，将 src/examples/ 下的扩展示例拷贝到自己工程内后引入
import templateExtension from './extensions/template-extension';
import onlineImageExtension from './extensions/online-image';
import aiToolsExtension from './extensions/ai-tools-extension';

export default {
  name: 'ConsumerApp',
  components: { FabricEditor },
  setup() {
    const editor = ref(null);

    // 内置能力适配器（可选）
    const adapters = {
      font: { list: () => Promise.resolve([]) },
      size: {
        list: () => Promise.resolve([{ id: 1, name: '海报', width: 400, height: 600, unit: 'px' }]),
      },
    };

    // 业务扩展：模板管理 + 在线图片(CDN上传) + AI
    const extensions = [templateExtension, onlineImageExtension, aiToolsExtension];

    // 业务自持的初始加载（无路由依赖）
    const onReady = ({ api }) => {
      const q = new URLSearchParams(window.location.search);
      const tempId = q.get('tempId');
      if (tempId) {
        templateExtension.services.template.get(tempId).then(({ json }) => api.loadJSON(json));
      }
    };

    // 保存：外壳按钮 emit save-request，持久化归业务
    const onSave = async ({ json }) => {
      const q = new URLSearchParams(window.location.search);
      const id = q.get('id');
      if (id) {
        await templateExtension.services.template.update(id, { json });
      } else {
        await templateExtension.services.template.create({ name: '作品', json });
      }
      // eslint-disable-next-line no-alert
      alert('已保存');
    };

    return { editor, adapters, extensions, onReady, onSave };
  },
};
</script>
```

### 扩展示例（位于 `src/examples/`）

| 扩展 | 位置 | 说明 |
| --- | --- | --- |
| template-extension | `src/examples/template-extension/` | 模板管理（列表/保存/加载） |
| online-image | `src/examples/online-image/` | 在线图片（CDN 上传 + 素材面板） |
| ai-tools-extension | `src/examples/ai-tools-extension/` | AI 工具面板 |
| smart-poster/legacy | `src/examples/smart-poster/legacy/` | 旧版 fabric 3.6.6 数据渲染（含 `normalizeLegacyObject` 转换） |

## 组件文档

库对外提供两个组件：

| 组件 | 源码 | 包内入口 | 用途 |
| --- | --- | --- | --- |
| `FabricEditor` | `src/lib/FabricEditor.vue` | `@chenyican/vue-fabric-editor` | 完整编辑器：顶栏 + 左栏面板 + 画布 + 右栏属性 + 全部编辑插件 |
| `FabricRenderer` | `src/lib/FabricRenderer.vue` | `@chenyican/vue-fabric-editor/fabric-renderer` | 前台只读渲染：仅加载与渲染模板，无任何编辑/交互能力，体积更小 |

两个组件都依赖 `@vue/composition-api`，宿主必须先 `Vue.use(VueCompositionAPI)`。
编辑器组件还需要样式与 i18n：

```js
import { createI18n } from '@chenyican/vue-fabric-editor';
import '@chenyican/vue-fabric-editor/style'; // = dist/vue-fabric-editor/vue-fabric-editor.css
```

> i18n 说明：编辑器文案走 `vue-i18n`，把 `createI18n()` 的实例挂到根实例的 `i18n` 选项即可（见最小消费工程示例）。
> 未接入时 `t()` 会退化为返回 key 本身，界面仍可运行。

类型声明：包内提供 `.d.ts`（`types/index.d.ts` 与 `types/fabric-renderer.d.ts`，经 `types` / `exports.types` /
`typesVersions` 串联），TS 项目可直接获得两个组件的 Props、事件与命令式 `api` 的类型提示，无需自行 `declare module`。

### `FabricEditor`

```vue
<template>
  <!-- 组件内部按 100vh 铺满，外层容器需给足高度 -->
  <div style="height: 100vh; overflow: hidden">
    <FabricEditor
      ref="editor"
      :adapters="adapters"
      :extensions="extensions"
      @ready="onReady"
      @save-request="onSave"
    />
  </div>
</template>
```

#### Props

| 名称 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `adapters` | `Object` | `{}` | 能力适配器（业务数据源注入），见下表 |
| `extensions` | `Array` | `[]` | 运行时扩展，见「扩展（extensions）」 |
| `options` | `Object` | `{}` | 编辑器配置，见下表 |
| `remoteImageMode` | `Boolean` | `false` | 强制远程图片模式：禁用本地上传与「在线图转 base64」，图片一律以远程 URL 入库 |
| `defaultText` | `String` | `'新建文本'` | 新建文本元素的默认内容 |
| `defaultTextbox` | `String` | `'新建文本'` | 新建文本框元素的默认内容 |
| `defaultQrCodeData` | `String` | `'https://example.com'` | 二维码元素的默认内容 |

`options` 字段：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `showSaveButton` | `Boolean` | `true` | 是否显示顶栏「清空 / 保存 / 提交」按钮；业务自持保存时置 `false` |
| `messageDuration` | `Number` | `5` | 全局 Message 提示时长（秒），`0` 表示不自动关闭 |
| `workspace` | `{ width, height }` | — | 初始化画布尺寸；不传时由 `WorkspacePlugin` 按 `#workspace` 容器自适应 |
| `cacheBust` | `Boolean \| { param, getValue }` | `feDomain=location.hostname` | 远程图片按接入域名分片缓存（CDN 按域名返回 CORS 头/隔离缓存）；`false` 关闭。JSON 存储态始终为干净 URL |
| `useAssetManifest` | `Boolean` | `false` | 开启资源清单去重，相同素材只存一份 |

`adapters` 契约：

| key | 契约 | 说明 |
| --- | --- | --- |
| `font` | `{ list: () => Promise<[{ name, file, type, img }]> }` | 字体列表；不传则不使用自定义字体 |
| `size` | `{ list: () => Promise<[{ id, name, width, height, unit }]> }` | 画布尺寸预设 |
| `variable` | `{ list: () => Promise<defs>, save?: (defs) => Promise }` | 变量表；未实现 `save` 时降级为「导出变量表 JSON」 |

`adapters` 的 key 会原样注册进适配器注册表，扩展内可用 `api.getAdapter(key)` 取回；`font` / `size` / `variable` 三个 key 由内置插件直接消费。

#### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `ready` | `{ api, editor, canvas }` | 画布与全部插件初始化完成，`api` 为命令式接口 |
| `save-request` | `{ json }` | 点击顶栏提交按钮；组件本身不落库，持久化由业务接管 |

#### Slot

| 名称 | 说明 |
| --- | --- |
| `topbar` | 替换整个顶栏；不提供时使用内置顶栏（导入 / 撤销重做 / 清空 / 快速预览 / 保存 / 提交） |

#### 实例与上下文

- `this.$refs.editor.api`：命令式 API，与 `ready` 事件的 `api` 同源。
- `provide('canvasEditor')`：引擎实例 `editor`；`provide('fabric')`：fabric 命名空间。
- `useEditorContext()`：扩展组件内取 `{ canvas, editor, registry, ui, extensions, api, t, options }`。

#### `api` 方法

| 分类 | 方法 | 说明 |
| --- | --- | --- |
| 画布 | `loadJSON(json)` | 加载模板 JSON |
| | `getJSON()` | 取当前画布 JSON |
| | `setSize(w, h)` / `getSize()` | 设置 / 读取画布尺寸 |
| | `clear()` | 清空画布 |
| | `preview()` | 预览 |
| | `exportFile(type, multiplier)` | 导出：`'json'` / `'svg'` / `'png'`（`multiplier` 为 png 倍率） |
| | `undo()` / `redo()` | 撤销 / 重做 |
| | `getSelectMode()` | 当前选择模式 |
| 注册表 | `registerAdapter(key, value)` | 注册能力适配器，返回注销函数 |
| | `getAdapter(key)` / `hasAdapter(key)` | 读取 / 判断适配器 |
| | `registerComponent(key, comp)` / `getComponent(key)` | 覆盖 / 读取内置 UI 组件 |
| 扩展 | `registerExtension(ext)` / `unregisterExtension(id)` | 运行时注册 / 注销扩展 |
| 事件 | `on(event, cb)` / `off(event, cb)` / `emit(event, payload)` | 引擎事件透传（如 `variable:previewChange`） |
| 插件 | `getPlugin(name)` | 取插件实例 |
| 变量表 | `setVariableSchema(defs)` / `getVariableSchema()` | 直接注入 / 读取变量表（视为导入，只读） |
| | `ensureVariableSchemaLoaded()` | 适配器懒加载（幂等），失败由调用方降级 |
| | `addCustomVariable` / `updateCustomVariable(path, patch)` / `removeCustomVariable(path)` | 自定义变量 CRUD |
| | `isImportedVariable(path)` | 是否为导入变量（只读） |
| | `saveVariableSchema()` | 调 `adapters.variable.save` 落库 |
| | `exportVariableSchema()` | 导出变量表 JSON 字符串（对接兜底） |
| | `getVariableEntries()` | 扫描画布变量，返回 `[{ path, fields }]` |

#### 扩展（extensions）

每个扩展是一个普通对象，需带唯一 `id`：

```js
{
  id: 'template',                                          // 必填，唯一
  services: { template: { list, get, create, update } },   // 自动注册进 adapter 注册表
  panels: [                                                // region: left / right / top
    { region: 'left', tab: { key: 'tpl', label: '模板', icon: 'md-images' }, component: TplPanel },
  ],
  overrides: [{ component: 'TopbarImport', with: MyTopbarImport }], // 覆盖内置 UI 组件
  lifecycle: { onReady(ctx), onDestroy(ctx) },             // 生命周期
}
```

- `panels` 注册即出现、注销即消失（reactive）；`left` 区面板排在内置「元素 / 图层」之后。
- `services` 与 `overrides` 在扩展注销时自动清理。

### `FabricRenderer`

前台渲染组件：只负责把「模板 JSON + 变量数据」渲染成画布，无编辑能力，适合 C 端展示/出图。

```vue
<template>
  <div style="width: 400px; height: 600px">
    <FabricRenderer
      :json="tplJson"
      :data="{ user: { name: '张三' } }"
      :adapters="adapters"
      @rendered="onRendered"
      @error="onError"
    />
  </div>
</template>

<script>
import { FabricRenderer } from '@chenyican/vue-fabric-editor/fabric-renderer';
// 样式（可选，仅画布容器基础样式）：@chenyican/vue-fabric-editor/fabric-renderer/style

export default {
  components: { FabricRenderer },
  data() {
    return { tplJson: null, adapters: { font: { list: () => Promise.resolve([]) } } };
  },
  methods: {
    onRendered({ core, canvas }) {},
    onError(e) {},
  },
};
</script>
```

#### Props

| 名称 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `json` | `Object \| String` | `null` | 编辑器输出的模板 JSON；字符串会自动 `JSON.parse` |
| `data` | `Object` | `{}` | 变量数据，按点路径取值，如 `{ user: { name: '张三' } }` |
| `schema` | `Array` | `null` | 变量表（可选），用于 `defaultValue` 回退；未注入时回读模板自带的 `variableMeta.schema` |
| `adapters` | `Object` | `{}` | 与编辑器同契约，渲染期消费 `font.list()`（自定义字体加载） |
| `options` | `Object` | `{}` | 渲染配置，见下表 |

> `schema` 优先级：`schema` prop > `options.schema` > 模板内 `variableMeta.schema`（不做 merge）。

`options` 字段：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `delimiter` | `String` | 模板 `variableMeta.delimiter`，缺省用默认分隔符 | 变量分隔符 |
| `defaultQrCodeData` | `String` | — | 二维码兜底内容 |
| `schema` | `Array` | — | 变量表，与 `schema` prop 等价（prop 优先） |
| `cacheBust` | `Boolean \| { param, getValue }` | `feDomain=location.hostname` | 同编辑器；`false` 关闭 |
| `crossOrigin` | `String \| null` | `'anonymous'` | 图片跨域策略；服务器不支持 CORS 时置 `null`（仅可显示、不可导出） |

#### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `ready` | `{ core, canvas }` | 画布与渲染内核创建完成 |
| `rendered` | `{ core, canvas }` | 一次渲染流程完成 |
| `error` | `Error` | 渲染过程异常 |
| `renderer-error` | `payload` | 资源加载失败（如背景图 CORS/URL 失效）；默认仅 `console.warn`，宿主可监听后自行提示 |

#### 渲染规则

- `json` / `data`（深度监听）/ `schema` 任一变化自动重渲染；并发渲染按序号丢弃过期结果。
- 渲染管线：变量替换（深拷贝，不污染传入 JSON）→ 资源清单展开 + 缺省字段补回 + 二维码/条形码参数还原 + 字体加载 → `autoGrow` 增高 → 图片就绪后变量图拉伸到版位 + 背景重排 → 上屏。
- 画布按 JSON 中的实际像素 **1:1 显示，不做缩放**；容器尺寸不足时滚动查看。
- 组件卸载时自动 `core.destroy()`。

## 上游与许可

- 上游项目：[ikuaitu/vue-fabric-editor](https://github.com/ikuaitu/vue-fabric-editor)，MIT License，基于 **Vue 3 + Vite + TypeScript**。
- 本仓库是上游项目在 **Vue 2.6 + Vue CLI + JavaScript** 下的移植与二次开发版本，沿用 MIT 协议，并保留上游源码中的版权与作者声明（各文件头的 `@Author` 注释请勿批量删除）。
- 第三方代码与资源（tailwindcss 构建产物、取色器、标尺插件等）清单见 [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)。

### 致谢

- 上游项目作者 秦少卫（nihaojob）及 [vue-fabric-editor](https://github.com/ikuaitu/vue-fabric-editor) 的所有贡献者。
- 刘明野：标尺功能作者。
- palxiao：设计编辑器的渐变组件。

## 环境配置

`.env` 中的变量只用于**开发站点与示例页面**（模板列表、素材、后台等 demo 页），
构建编辑器库（`npm run build:lib`、`npm run build:lib:renderer`）不依赖这些配置，库本身不读取任何环境变量。

| 变量 | 说明 |
| --- | --- |
| `VUE_APP_TITLE` | 站点标题 |
| `VUE_APP_BASE_PATH` | 部署基础路径（生产构建的 `publicPath`） |
| `VUE_APP_APIHOST` | 素材/模板等数据服务地址 |
| `VUE_APP_ADMINAPIHOST` | 后台管理接口地址 |
| `VUE_APP_FLAG` | 环境标识：`dev` / `staging` / `prod` |

如需接入自己的服务，直接修改 `.env`，或新建 `.env.local`（已被 git 忽略）覆盖，
避免把私有服务地址提交到仓库：

```bash
# .env.local
VUE_APP_APIHOST=https://your-api.example.com
VUE_APP_ADMINAPIHOST=https://your-admin-api.example.com
```

## 字体

仓库不内置任何字体文件：上游内置的商业中文字体（华康金刚黑、汉体）已因字体版权原因移除。
如需内置字体，请使用可自由分发的字体（思源黑体、霞鹜文楷等 SIL OFL / Apache-2.0 授权字体），
放入 `src/assets/fonts/cn/` 并在 `src/assets/fonts/font.css` 中声明 `@font-face`。
