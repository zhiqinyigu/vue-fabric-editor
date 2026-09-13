# vue-fabric-editor（Vue 2 版）

基于 **Vue 2.6 + Fabric.js 5 + Vue CLI 4** 的图片 / 海报设计编辑器。
移植自 [ikuaitu/vue-fabric-editor](https://github.com/ikuaitu/vue-fabric-editor)（Vue 3 + Vite 版），本仓库为 Vue 2 二次开发版。

> 许可：MIT。详见 [LICENSE](./LICENSE)、[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)、文末[致谢](#致谢)。

## 交付物

| 交付物 | 源码入口 | 构建产物 | 用途 |
| --- | --- | --- | --- |
| **编辑器库** `@chenyican/vue-fabric-editor` | `src/lib/index.js` | `dist/vue-fabric-editor/` | 完整编辑器组件 `FabricEditor` + 引擎 + 全部编辑插件 |
| **前台渲染器** `@chenyican/vue-fabric-editor/fabric-renderer` | `src/lib/renderer.js` | `dist/fabric-renderer/` | 只读渲染组件 `FabricRenderer`，C 端展示 / 出图用，无编辑能力 |
| **扩展示例** | `src/examples/` | — | 模板管理、在线图片、AI 工具、海报入口等，**拷贝进自己工程改造**使用 |

---

## 目录

- [1. 本地跑起来](#1-本地跑起来)
- [2. 作为组件使用](#2-作为组件使用)
- [3. 组件文档](#3-组件文档)
- [4. 扩展示例](#4-扩展示例)
- [5. 二次开发](#5-二次开发)
- [6. 常见问题（踩坑速查）](#6-常见问题踩坑速查)
- [7. 发布 / 环境 / 字体 / 许可](#7-发布环境字体许可)

---

## 1. 本地体验/预览

### 1.1 环境

- **Node 12 ~ 16**（Vue CLI 4 + webpack 4）。Node 17+ 需额外设置 `NODE_OPTIONS=--openssl-legacy-provider`，否则 dev/build 会报 `ERR_OSSL_EVP_UNSUPPORTED`。
- 首次执行 `npm install` 安装依赖。

### 1.2 命令

```bash
npm install                    # 安装依赖

npm run serve                  # 开发站点（默认 3000 端口，见 vue.config.js devServer）
npm run build                  # 构建演示站点 → dist/（index.html + js/css/fonts）
npm run build:staging          # 站点：staging 环境
npm run build:prod             # 站点：生产环境

npm run build:lib              # 构建编辑器库 → dist/vue-fabric-editor/
npm run build:lib:renderer     # 构建渲染器库 → dist/fabric-renderer/

npm test                       # jest 全量单测
npm run test:layer             # layer.vue 拖拽排序手动验证脚本（JSDOM，独立于 jest）
npm run typecheck              # 校验 types/*.d.ts
npm run lint                   # eslint
```

> **产物注意**：两个 lib 构建用 `--dest` 输出到不同子目录（不要改成同一个目录，后一次构建会清掉前一次产物）。
> `npm run build`（站点）会清理 `dist/` 根目录，若同时需要 lib 产物，构建后重新执行对应 `build:lib*` 即可。`dist/` 已被 git 忽略。

### 1.3 演示路由（`npm run serve` 后访问）

| 路由 | 看什么 | 对应源码 |
| --- | --- | --- |
| `/demo` | **编辑器集成示例**：可跑示例，直接引 `src/` 源码 | `src/views/demo/index.vue` |
| `/renderer-demo` | **渲染器集成示例**：模板 JSON + 数据 → 画布 | `src/views/renderer-demo/index.vue` |
| `/legacy-demo` | 旧版数据（fabric 3.6.6 格式）渲染与转换 | `src/views/legacy-demo/index.vue` |
| `/poster-entry-demo` | **运营后台集成示例**，海报配置入口：预览卡片 + 配置弹窗 + 跳编辑页 | `src/views/poster-entry-demo/index.vue` |
| `/poster-editor-demo` | **运营后台集成示例**（配合上一条的跳转），海报编辑页 | `src/views/poster-entry-demo/editor.vue` |
| `/` | 原[ikuaitu/vue-fabric-editor](https://github.com/ikuaitu/vue-fabric-editor)的演示页，用来校验功能完整性 | `src/views/home/index.vue` |
| `/template` | 模板列表页 | `src/views/template/index.vue` |

### 1.4 源码目录地图

```
src/
├── lib/            # 包入口：index.js（编辑器）、renderer.js（渲染器）、FabricEditor.vue / FabricRenderer.vue
├── core/           # 引擎：Editor / RendererCore / PluginEngine / 插件（plugin/）/ 纯函数（variableEngine、imageLoader…）
├── components/     # 编辑器 UI（左栏面板、右栏属性、工具栏等）
├── hooks/          # 组合式工具（useSelect / useI18n / useEditorContext…）
├── views/          # 演示站点页面 + 业务外壳组件（RightPanel 等）
├── examples/       # 扩展示例（拷贝改造用）
└── language/       # 文案（zh / en / pt）
```

> **改源码前先读 [ARCHITECTURE.md](./ARCHITECTURE.md)**：它给出三条铁律、"我要做 X 该改哪里"速览表、双引擎约定与提交前检查清单（本文档只讲怎么用，不讲代码该写在哪）。

---

## 2. 作为组件使用

### 2.1 安装

```bash
npm i @chenyican/vue-fabric-editor
```

库的运行时依赖都声明在 `peerDependencies`：**npm 7+ 会自动装齐，npm 6 / `--legacy-peer-deps` 不会**。

**① 查缺 + 生成补装命令**（在消费项目根目录执行，只读不改动文件；按接入方式选一条，输出可直接复制的 `npm i`）

编辑器版：

```bash
node -e "const fs=require('fs'),p=require('@chenyican/vue-fabric-editor/package.json'),m=Object.keys(p.peerDependencies).filter(d=>!fs.existsSync('node_modules/'+d));console.log(m.length?'缺少 '+m.length+' 个，复制执行：\n\nnpm i '+m.join(' '):'编辑器依赖齐全，无需安装')"
```

渲染器版（只检查渲染器必需的 9 个）：

```bash
node -e "const fs=require('fs'),need=['vue','@vue/composition-api','fabric','events','tapable','uuid','fontfaceobserver','jsbarcode','qr-code-styling'],m=need.filter(d=>!fs.existsSync('node_modules/'+d));console.log(m.length?'缺少 '+m.length+' 个，复制执行：\n\nnpm i '+m.join(' '):'渲染器依赖齐全，无需安装')"
```

> 对照**所装版本**包内的 `peerDependencies` 检查根目录 `node_modules`。全新项目在空目录执行会输出
> 完整的 16 / 9 个包命令，效果等同一次装齐。不跑命令也行：启动 / 构建报
> `Module not found: Can't resolve 'xxx'` 时，按包名补装即可。

> **从 1.0.3 及更早升级**：画布素材（控件图标 / 滤镜缩略图）已全部内联、`svg-path-editor-lib`
> 已随包打包——消费项目里的 `VfeAssetsPlugin` 配置和 `transpileDependencies` 条目都可以删掉，
> `npm i` 也不再有这两个包的要求。

### 2.2 接入：编辑器（`FabricEditor`）

两者是**独立入口、各自按需接入**：只做前台海报展示的项目看 §2.3 即可，不必引入 ViewUI / i18n 等编辑器专属依赖。

**`main.js`**

```js
import Vue from 'vue';
import ViewUI from 'view-design';
import 'view-design/dist/styles/iview.css';
import VueCompositionAPI from '@vue/composition-api';
import { createI18n, installRuntime } from '@chenyican/vue-fabric-editor';
import '@chenyican/vue-fabric-editor/style'; // 编辑器样式（渲染器用 /fabric-renderer/style）
import App from './App.vue';

Vue.use(VueCompositionAPI);
Vue.use(ViewUI);

// 单实例注入：把本项目的 vue / composition-api 显式交给编辑器包（推荐，一行）
installRuntime({ vue: Vue, compositionApi: VueCompositionAPI });

new Vue({ i18n: createI18n(), render: (h) => h(App) }).$mount('#app');
```

编辑器界面使用 `i-*` 组件，所以 `Vue.use(ViewUI)` 必须执行；根实例挂不挂 `i18n` 可选（不挂则 `t()` 退化为返回 key，文案显示为 key，功能不受影响）。

关于那行 `installRuntime`：依赖树里若出现第二份 `vue` / `@vue/composition-api`，会分别导致 `_vm.$t is not a function` 与 `The setup binding property "..." is already declared`。入口调用一次即可消除，**跨打包器通用、不需要构建期配置**（渲染器同样适用，见 §2.3）。不调用则回退为历史行为，可用 `isRuntimeInjected()` 自检；原理见 [PACKAGING.md §4.6](./PACKAGING.md)。

**`App.vue`**

```vue
<template>
  <!-- 组件内部按 100vh 铺满，外层容器要给足高度 -->
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
import { FabricEditor } from '@chenyican/vue-fabric-editor';

export default {
  components: { FabricEditor },
  data() {
    return {
      adapters: {
        font: { list: () => fetch('/api/fonts').then((r) => r.json()) },
        size: { list: () => Promise.resolve([{ id: 1, name: '海报', width: 400, height: 600, unit: 'px' }]) },
        variable: { list: () => Promise.resolve([{ path: 'course.name', label: '课程名', type: 'text' }]) },
      },
      extensions: [], // 见 §4
    };
  },
  methods: {
    onReady({ api }) {
      // 业务自持初始加载
      api.loadJSON(myTemplateJson);
    },
    async onSave({ json }) {
      await fetch('/api/poster', { method: 'POST', body: JSON.stringify({ json }) });
    },
  },
};
</script>
```

### 2.3 接入：渲染器（`FabricRenderer`，只读展示）

只渲染不编辑，**不需要 ViewUI、不需要 i18n**（svg-path-editor-lib 只服务编辑器且已随包打包）。

**`main.js`**

```js
import Vue from 'vue';
import VueCompositionAPI from '@vue/composition-api';
import { installRuntime } from '@chenyican/vue-fabric-editor/fabric-renderer';
import '@chenyican/vue-fabric-editor/fabric-renderer/style'; // 可选
import App from './App.vue';

Vue.use(VueCompositionAPI);
// 单实例注入：作用与自检方式同 §2.2
installRuntime({ vue: Vue, compositionApi: VueCompositionAPI });

new Vue({ render: (h) => h(App) }).$mount('#app');
```

**组件里用**

```vue
<template>
  <div style="width: 400px; height: 600px">
    <FabricRenderer :json="json" :data="data" @error="onError" />
  </div>
</template>

<script>
import { FabricRenderer } from '@chenyican/vue-fabric-editor/fabric-renderer';

export default {
  components: { FabricRenderer },
  // json：编辑器保存的海报 JSON；data：变量数据（点路径取值，如 { user: { name: '张三' } }）
  data: () => ({ json: null, data: {} }),
};
</script>
```

| 步骤 | 编辑器 | 渲染器 |
| --- | --- | --- |
| `Vue.use(VueCompositionAPI)` | 必须 | 必须 |
| `Vue.use(ViewUI)` + `iview.css` | 必须 | 不需要 |
| CSS 入口 | `/style` | `/fabric-renderer/style` |
| `createI18n()` | 可选 | 不需要 |
| `installRuntime({ vue, compositionApi })` | 推荐 | 推荐 |

### 2.4 CSS / i18n / 类型

| 项 | 现代栈（webpack5 / Vite） | webpack 4 |
| --- | --- | --- |
| 编辑器 JS | `import { FabricEditor } from '@chenyican/vue-fabric-editor'` | 相同 |
| 编辑器 CSS | `import '@chenyican/vue-fabric-editor/style'` | `import '@chenyican/vue-fabric-editor/dist/vue-fabric-editor/vue-fabric-editor.css'` |
| 渲染器 JS | `import { FabricRenderer } from '@chenyican/vue-fabric-editor/fabric-renderer'` | 相同 |
| 渲染器 CSS | `import '@chenyican/vue-fabric-editor/fabric-renderer/style'` | `import '@chenyican/vue-fabric-editor/dist/fabric-renderer/fabric-renderer.css'` |

- **i18n（仅编辑器）**：`createI18n()` 的实例挂到根实例 `i18n` 选项即可（见 §2.2）。未接入时 `t()` 退化为返回 key，界面仍可运行。
- **类型**：包内自带 `.d.ts`（`types/index.d.ts`、`types/fabric-renderer.d.ts`），TS 项目开箱可用，无需 `declare module`。
- **webpack4 + 根级 postcss 配置**：宿主根目录有 `postcss.config.js` 时，import 包内 css（`/style`、`/fabric-renderer/style`）或 iview.css 会报 `No PostCSS Config found`——postcss-loader 3 从 css 文件位置向上查找配置，node_modules 内的 css 找不到宿主根级配置。在 `vue.config.js` 显式指定：`css.loaderOptions.postcss.config.path = path.resolve(__dirname, 'postcss.config.js')`；宿主无 postcss 配置文件则不受影响。

### 2.5 接入检查清单

- [ ] `Vue.use(VueCompositionAPI)` 已执行（两个组件都依赖）
- [ ] 已引入对应 CSS：编辑器 `/style`、渲染器 `/fabric-renderer/style`
- [ ] 入口调用了 `installRuntime({ vue, compositionApi })`
- [ ] **仅编辑器**：`Vue.use(ViewUI)` 已执行（模板使用 `i-*` 组件）
- [ ] 外层容器给了高度（编辑器按 `100vh` 铺满）
- [ ] 远程图片服务器支持 CORS（否则可显示但**无法导出 PNG**）

---

## 3. 组件文档

| 组件 | 包内入口 | 说明 |
| --- | --- | --- |
| `FabricEditor` | `@chenyican/vue-fabric-editor` | 完整编辑器：顶栏 + 左栏面板 + 画布 + 右栏属性 + 全部编辑插件 |
| `FabricRenderer` | `@chenyican/vue-fabric-editor/fabric-renderer` | 前台只读渲染：只加载与渲染，无编辑能力，体积更小 |

### 3.1 `FabricEditor`

#### 3.1.1 Props

| 名称 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `adapters` | `Object` | `{}` | 能力适配器（业务数据源），见下表 |
| `extensions` | `Array` | `[]` | 运行时扩展，见 [§3.1.6](#316-扩展extensions) |
| `options` | `Object` | `{}` | 编辑器配置，见下表 |
| `remoteImageMode` | `Boolean` | `false` | 强制远程图片模式：禁用本地上传与「在线图转 base64」，图片一律以远程 URL 入库 |
| `defaultText` | `String` | `'新建文本'` | 新建文本元素默认内容 |
| `defaultTextbox` | `String` | `'新建文本'` | 新建文本框元素默认内容 |
| `defaultQrCodeData` | `String` | `'https://example.com'` | 二维码元素默认内容 |

`options`：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `showSaveButton` | `Boolean` | `true` | 是否显示顶栏「清空 / 保存 / 提交」；业务自持保存时置 `false` |
| `messageDuration` | `Number` | `5` | 全局 Message 提示时长（秒），`0` 不自动关闭 |
| `workspace` | `{ width, height }` | — | 初始化画布尺寸；不传由 `WorkspacePlugin` 按容器自适应 |
| `cacheBust` | `Boolean \| { param, getValue }` | `feDomain=location.hostname` | 远程图按接入域名分片缓存；`false` 关闭。JSON 存储态始终是干净 URL |
| `useAssetManifest` | `Boolean` | `false` | 开启资源清单去重，相同素材只存一份 |
| `crossOrigin` | `String \| null` | `'anonymous'` | 图片跨域策略；`'strict'` 关闭回退（严格 CORS，失败即不显示） |

`adapters` 契约：

| key | 契约 | 说明 |
| --- | --- | --- |
| `font` | `{ list: () => Promise<[{ name, file, type, img }]> }` | 字体列表；不传则不用自定义字体 |
| `size` | `{ list: () => Promise<[{ id, name, width, height, unit }]> }` | 画布尺寸预设 |
| `variable` | `{ list: () => Promise<defs>, save?: (defs) => Promise }` | 变量表；未实现 `save` 时降级为「导出变量表 JSON」 |

`adapters` 的 key 会原样注册进适配器注册表，扩展内可用 `api.getAdapter(key)` 取回；`font` / `size` / `variable` 由内置插件直接消费。

#### 3.1.2 Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `ready` | `{ api, editor, canvas }` | 画布与全部插件初始化完成；`api` 为命令式接口 |
| `save-request` | `{ json }` | 点击顶栏提交按钮；组件不落库，持久化由业务接管 |
| `save-error` | `Error` | 导出失败（典型：跨域图片污染画布） |

#### 3.1.3 Slot

| 名称 | 说明 |
| --- | --- |
| `topbar` | 替换整个顶栏；不提供则用内置顶栏（导入 / 撤销重做 / 清空 / 快速预览 / 保存 / 提交） |

#### 3.1.4 实例与上下文

- `this.$refs.editor.api`：命令式 API，与 `ready` 事件里的 `api` 同源。
- `provide('canvasEditor')` → 引擎实例；`provide('fabric')` → fabric 命名空间。
- `useEditorContext()`：扩展组件内取 `{ canvas, editor, registry, ui, extensions, api, t, options }`。

#### 3.1.5 `api` 方法

| 分类 | 方法 | 说明 |
| --- | --- | --- |
| 画布 | `loadJSON(json)` | 加载模板 JSON |
| | `getJSON()` | 取当前画布 JSON |
| | `setSize(w, h)` / `getSize()` | 设置 / 读取画布尺寸 |
| | `clear()` | 清空画布 |
| | `preview()` | 预览 |
| | `exportFile(type, multiplier)` | 导出 `'json'` / `'svg'` / `'png'`（`multiplier` 为 png 倍率） |
| | `undo()` / `redo()` | 撤销 / 重做 |
| | `getSelectMode()` | 当前选择模式 |
| 注册表 | `registerAdapter(key, value)` | 注册适配器，返回注销函数 |
| | `getAdapter(key)` / `hasAdapter(key)` | 读取 / 判断适配器 |
| | `registerComponent(key, comp)` / `getComponent(key)` | 覆盖 / 读取内置 UI 组件 |
| 扩展 | `registerExtension(ext)` / `unregisterExtension(id)` | 运行时注册 / 注销扩展 |
| 事件 | `on(event, cb)` / `off(event, cb)` / `emit(event, payload)` | 引擎事件（如 `variable:previewChange`、`image:cors-fallback`） |
| 插件 | `getPlugin(name)` | 取插件实例 |
| 变量表 | `setVariableSchema(defs)` / `getVariableSchema()` | 注入 / 读取变量表（视为导入，只读） |
| | `ensureVariableSchemaLoaded()` | 适配器懒加载（幂等） |
| | `addCustomVariable` / `updateCustomVariable(path, patch)` / `removeCustomVariable(path)` | 自定义变量 CRUD |
| | `isImportedVariable(path)` | 是否导入变量（只读） |
| | `saveVariableSchema()` | 调 `adapters.variable.save` 落库 |
| | `exportVariableSchema()` | 导出变量表 JSON 字符串 |
| | `getVariableEntries()` | 扫描画布变量 → `[{ path, fields }]` |

#### 3.1.6 扩展（extensions）

```js
{
  id: 'template',                                            // 必填且唯一
  services: { template: { list, get, create, update } },      // 自动注册进 adapter 注册表
  panels: [                                                   // region: left / right / top
    { region: 'left', tab: { key: 'tpl', label: '模板', icon: 'md-images' }, component: TplPanel },
  ],
  overrides: [{ component: 'TopbarImport', with: MyTopbarImport }], // 覆盖内置 UI 组件
  lifecycle: { onReady(ctx), onDestroy(ctx) },
}
```

- `panels` 注册即出现、注销即消失（reactive）；`left` 区排在「元素 / 图层」之后。
- `services` / `overrides` 随扩展注销自动清理。

### 3.2 `FabricRenderer`

#### 3.2.1 Props

| 名称 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `json` | `Object \| String` | `null` | 编辑器输出的模板 JSON；字符串自动 `JSON.parse` |
| `data` | `Object` | `{}` | 变量数据，按点路径取值，如 `{ user: { name: '张三' } }` |
| `schema` | `Array` | `null` | 变量表（可选），用于 `defaultValue` 回退；未注入时回读模板 `variableMeta.schema` |
| `adapters` | `Object` | `{}` | 与编辑器同契约；渲染期消费 `font.list()` |
| `options` | `Object` | `{}` | 渲染配置，见下表 |

> `schema` 优先级：`schema` prop > `options.schema` > 模板内 `variableMeta.schema`（不做 merge）。

`options`：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `delimiter` | `Object` | 模板 `variableMeta.delimiter` → 默认分隔符 | 变量分隔符 `{ start, end }` |
| `defaultQrCodeData` | `String` | — | 二维码兜底内容 |
| `schema` | `Array` | — | 等价于 `schema` prop（prop 优先） |
| `cacheBust` | `Boolean \| { param, getValue }` | 同编辑器 | `false` 关闭 |
| `crossOrigin` | `String \| null` | `'anonymous'` | 服务器不支持 CORS 时置 `null`（仅可显示、不可导出） |

#### 3.2.2 Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `ready` | `{ core, canvas }` | 画布与渲染内核创建完成 |
| `rendered` | `{ core, canvas }` | 一次渲染流程完成 |
| `error` | `Error` | 渲染过程异常 |
| `renderer-error` | `payload` | 资源加载失败（如背景图 CORS / URL 失效）；默认 `console.warn`，宿主可监听后自行提示 |

#### 3.2.3 渲染规则

- `json` / `data`（深度监听）/ `schema` 任一变化自动重渲染；并发渲染按序号丢弃过期结果。
- 管线：变量替换（深拷贝，不污染传入 JSON）→ 资源清单展开 + 缺省字段补回 + 二维码/条码参数还原 + 字体加载 → `autoGrow` 增高 → 图片就绪后变量图拉伸 + 背景重排 → 上屏。
- 画布按 JSON 实际像素 **1:1 显示，不缩放**；容器不足时滚动查看。
- 组件卸载时自动 `core.destroy()`。

---

## 4. 扩展示例

`src/examples/` 是**拷贝改造**用的工程示例，不是运行时依赖。本地可先看 `/demo` 路由（引源码实时可跑）。

| 示例 | 位置 | 说明 |
| --- | --- | --- |
| template-extension | `src/examples/template-extension/` | 模板管理（列表 / 保存 / 加载）：`index.js`（扩展定义）+ `adapter.js`（服务实现）+ `TemplatePanel.vue`（面板） |
| online-image | `src/examples/online-image/` | 在线图片：CDN 上传 + 素材面板 |
| ai-tools-extension | `src/examples/ai-tools-extension/` | AI 工具面板 |
| poster-entry | `src/examples/poster-entry/` | **海报入口范式**：预览舞台（`PosterEntryStage.vue`）+ 查看/配置弹窗（`PosterViewModal.vue`）+ 预览（`PosterPreview.vue`）+ 编辑页宿主（`PosterEditorHost.vue`）+ 跨页交接（`handoff.js`）+ 旧格式兼容（`admin/`） |
| smart-poster/legacy | `src/examples/smart-poster/legacy/` | 旧版 fabric 3.6.6 数据渲染与转换（`normalizeLegacyObject`） |

### 拷贝改造三步

1. 把整个示例目录拷进你的工程（如 `src/extensions/template/`）。
2. 把其中的接口（`adapter.js` / `services`）换成你的后端 API。
3. 在 `FabricEditor` 的 `:extensions` 数组里引入：

```js
import templateExtension from './extensions/template-extension';
export default { data: () => ({ extensions: [templateExtension] }) };
```

### 海报入口范式（`poster-entry`）

适合"后台配置海报 → 打开独立编辑页 → 保存回传"的场景，闭环如下：

1. 配置页用 `PosterEntryStage` 展示预览卡片；点「查看」打开弹窗（预览 / JSON 输入双模式），点「配置海报」跳编辑页。
2. 编辑页（`PosterEditorHost.vue`）读取交接信封（`handoff.js`，基于 localStorage + token），
   `ready` 后 `api.loadJSON(json)` 加载待编辑数据。
3. 保存时 `save-request` → 最小化 JSON 回写信封 → 原页面消费结果或回跳来源页。

真实落地参考：`admin_frontend` 项目的 `src/js/views/poster-editor/`。

---

## 5. 二次开发

### 5.1 从哪里下手

| 想做的事 | 改哪里 |
| --- | --- |
| 改编辑器 UI 结构 / 顶栏 / 左右栏 | `src/lib/FabricEditor.vue`、`src/views/home/components/*` |
| 改工具 / 属性面板 | `src/components/*`（右侧属性见 `src/components/attrPanel/`） |
| 改画布行为、加载/保存管线 | `src/core/Editor.js`、`src/core/ServersPlugin.js`、`src/core/plugin/*` |
| 加一个编辑能力（插件） | 见 [§5.2](#52-新增一个插件) |
| 加业务面板 / 覆盖内置 UI | 用 `extensions`（§3.1.6），无需改源码 |
| 加命令式 API | `src/lib/api.js`（`createEditorApi`） |
| 改变量能力 | `src/core/variableEngine.js`、`src/core/plugin/VariablePlugin.js` |
| 加文案 | `src/language/{zh,en,pt}.json` |

### 5.2 新增一个插件

插件是"编辑能力"的标准扩展单位（内置 28 个插件都走这套协议）。

```js
// src/core/plugin/MyPlugin.js
export default class MyPlugin {
  // 静态字段：唯一名、对外事件、代理到 editor 实例上的方法名
  static pluginName = 'MyPlugin';
  static events = ['myPlugin:change'];   // 可选：声明后可在 _checkPlugin 中查重
  static apis = ['doSomething'];         // 可选：声明后 editor.doSomething() 可用

  constructor(canvas, editor, options) {
    this.canvas = canvas;
    this.editor = editor;
    this.options = options || {};
    this.init();
  }

  init() {
    // 订阅选择/画布事件、注册右键菜单、初始化状态
  }

  // ---- 生命周期 hooks（返回 Promise 或值；按注册顺序串行执行）----
  hookImportBefore() { /* 加载 JSON 前 */ }
  hookImportAfter() { /* 加载 JSON 后，可拿到画布已有对象 */ return Promise.resolve(); }
  hookSaveBefore() { /* 取 JSON 前，可做收尾 */ }
  hookSaveAfter() { /* 导出后 */ }
  hookTransform() { /* 对象变换时（拖拽/缩放/旋转）*/ }

  // ---- 可选能力 ----
  // hotkeys = ['ctrl+z'];  hotkeyEvent(keyName, e) {}
  // contextMenu() { return [{ text: '动作', callback: () => {} }]; }

  // ---- 对外 API ----
  doSomething(payload) {
    this.canvas.requestRenderAll();
    this.editor.emit('myPlugin:change', payload);
  }

  destroy() { /* 解绑事件、清理资源 */ }
}
```

注册（`src/lib/FabricEditor.vue` 的 `.use(...)` 链）：

```js
import MyPlugin from '@/core/plugin/MyPlugin';
editor.use(MyPlugin, { someOption: true });
```

约定与坑：

- `pluginName` 重复会直接抛错；`apis` / `events` 名称全局唯一（避免覆盖内置方法）。
- hooks 是 `AsyncSeriesHook`（tapable）：必须返回 Promise 或值，**不要吞掉异常**，否则加载管线会静默中断。
- 插件销毁由 `editor.destory()` 统一触发，`destroy()` 里记得 `canvas.off(...)`。
- 需要与 UI 通信时：插件 `editor.emit('xxx')` → UI 监听；UI 调 `api.getPlugin('MyPlugin')` 拿实例。

### 5.3 新增 / 覆盖 UI

- **加面板**：扩展的 `panels`（region: `left` / `right` / `top`），无需改源码，见 §3.1.6。
- **覆盖内置组件**：扩展的 `overrides: [{ component: 'TopbarImport', with: MyComp }]`；
  内置可覆盖 key 见 `src/lib/index.js` 导出（`TopbarImport`、`RightPanel`）。
- **整体替换顶栏**：用 `FabricEditor` 的 `topbar` 插槽。

### 5.4 新增命令式 API

在 `src/lib/api.js` 的 `createEditorApi(ctx)` 中追加方法（`ctx` 提供 `canvas / editor / registry / ui / extensions`），
即可通过 `ready` 事件拿到的 `api` 或 `this.$refs.editor.api` 调用。

### 5.5 改完怎么验

```bash
npm run lint           # 代码规范
npm test               # 单测（新增行为建议补 tests/）
npm run typecheck      # 改了对外 API / Props 时同步 types/*.d.ts
npm run serve          # /demo 看效果
npm run build:lib && npm run build:lib:renderer   # 确认库产物可构建
```

> 对外 API（Props / 事件 / 命令式方法 / 扩展协议）有变更时，**必须同步更新** `types/index.d.ts` 与 `types/fabric-renderer.d.ts`（手写维护，已纳入 `npm run typecheck`）。

---

## 6. 常见问题（踩坑速查）

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `The setup binding property ... is already declared` | 依赖树有两份 `@vue/composition-api` | 入口 `installRuntime({ vue, compositionApi })`；或 `npm dedupe` |
| `_vm.$t is not a function` | 依赖树有两份 `vue` | 同上 |
| webpack4 `Can't resolve '@chenyican/vue-fabric-editor/style'` | webpack4 不识别 `exports` 子路径 | 用完整路径 `.../dist/vue-fabric-editor/vue-fabric-editor.css`（§2.4） |
| `No PostCSS Config found in: ...` | vue-cli4 / postcss-loader 3 对 node_modules 内 css（本包 style、iview.css）向上找不到宿主根级配置 | `vue.config.js` 指定 `css.loaderOptions.postcss.config.path`（§2.4）；无根级 postcss 配置文件则不受影响 |
| `Module parse failed` / `class static block` 相关报错 | 宿主其它依赖含 ES2022 语法 | 在 `transpileDependencies` 加入该依赖（本包 1.0.4 起 `svg-path-editor-lib` 已随包打包，无需配置） |
| `Cannot find module '.../loader/webpack-plugin.js'` | 1.0.4 起素材已内联，宿主接入插件已移除 | 删除消费项目 vue.config.js 里的 `VfeAssetsPlugin` 配置（见 §2.1 升级说明） |
| 导出 PNG 报跨域（`SecurityError`） | 画布被无 CORS 头的远程图污染 | 图床返回 `Access-Control-Allow-Origin`；或用同源图片代理 |
| 图片能显示但导出缺图 | 触发了 CORS 回退（画布已污染） | 同上；`options.crossOrigin = 'strict'` 可改为"失败即不显示" |
| 字体不生效 | 未提供 `adapters.font` 或字体文件无 CORS | 实现字体适配器并确保字体可跨域访问 |
| 画布空白 / 尺寸为 0 | 挂载时容器无高度 | 外层容器给足高度（组件按 `100vh` 铺满） |
| `MaxListenersExceededWarning`（selectOne 等） | 多个属性组件合法订阅 | 1.0.2+ 已内置 `setMaxListeners(0)`，升级即可 |
| dev/build 报 `ERR_OSSL_EVP_UNSUPPORTED` | Node 17+ 与 webpack4 的 OpenSSL 3 | 用 Node 12–16，或 `NODE_OPTIONS=--openssl-legacy-provider` |

更多构建期 / 发布期问题见 [PACKAGING.md](./PACKAGING.md) 的排查清单。

---

## 7. 发布 / 环境 / 字体 / 许可

### 7.1 发布

打包、发布流程、CI（OIDC）与消费侧验证见 **[PACKAGING.md](./PACKAGING.md)**。

### 7.2 环境配置（仅演示站点）

`.env` 中的变量只供**演示站点与示例页面**使用；构建两个 lib 不依赖它们（库不读任何环境变量）。

| 变量 | 说明 |
| --- | --- |
| `VUE_APP_TITLE` | 站点标题 |
| `VUE_APP_BASE_PATH` | 部署基础路径（生产 `publicPath`） |
| `VUE_APP_APIHOST` | 素材 / 模板等服务地址 |
| `VUE_APP_ADMINAPIHOST` | 后台管理接口地址 |
| `VUE_APP_FLAG` | 环境标识 `dev` / `staging` / `prod` |

私有地址请写进 `.env.local`（已被 git 忽略），避免提交到仓库。

### 7.3 字体

仓库不内置字体（上游内置的商业中文字体已因版权移除）。如需内置，请使用可自由分发的字体
（思源黑体、霞鹜文楷等 OFL / Apache-2.0 授权），放入 `src/assets/fonts/cn/` 并在
`src/assets/fonts/font.css` 声明 `@font-face`。

### 7.4 许可与致谢

- 上游项目：[ikuaitu/vue-fabric-editor](https://github.com/ikuaitu/vue-fabric-editor)（MIT，Vue 3 + Vite + TS）。
- 本仓库是其在 **Vue 2.6 + Vue CLI + JavaScript** 下的移植与二次开发版，沿用 MIT 协议，
  保留上游源码中的版权与作者声明（各文件头 `@Author` 注释请勿批量删除）。
- 第三方代码与资源清单： [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)。

#### 致谢

- 上游作者 秦少卫（nihaojob）及 [vue-fabric-editor](https://github.com/ikuaitu/vue-fabric-editor) 全体贡献者
- 刘明野（标尺功能）、palxiao（渐变组件）
