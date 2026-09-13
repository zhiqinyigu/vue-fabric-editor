# 架构规范：编辑器 / 渲染器 双引擎插件化

> 适用范围：本仓库所有与「`FabricEditor` 编辑器」「`FabricRenderer` 前台渲染」相关的后续迭代。
> 定位：这是**改代码前必读的约束文档**——不教你用组件（那是 [README](./README.md)），只规定"代码该写在哪、什么不能写"。

---

## 0. 导读（先看这里）

### 0.1 三条铁律

1. **引擎 = 容器，插件 = 能力**：`Editor` / `RendererCore` 只做「fabric canvas + 插件注册 + 加载管线」，任何业务逻辑都进插件。
2. **共享纯函数 = 单一事实来源**：几何、序列化、变量计算只有一份实现，编辑器与渲染器**必须复用同一模块**，禁止复制粘贴或另写一套。
3. **渲染器保持纯净**：`RendererCore` 不得出现任何编辑能力（撤销、选择、变换、右键、快捷键、标尺、图层…）。

### 0.2 一页速览：我要做 X，该看哪节

| 我想做的事 | 看哪节 | 典型落点 |
| --- | --- | --- |
| 加一个编辑能力（新工具/新交互） | §2 + §3.1 | `src/core/plugin/XxxPlugin.js` + 在 `FabricEditor.vue` 的 `.use()` 链注册 |
| 加一个渲染能力（C 端呈现） | §4 | `src/core/plugin/RendererXxxPlugin.js` + `RendererCore` 构造注册 |
| 改画布背景/尺寸/裁剪几何 | §5 | `src/core/workspaceGeometry.js` |
| 改「保存瘦身 / 加载补回」字段 | §5 + §6 | `jsonOptimizer.js` + `objectDefaults.js` 对称改 |
| 改变量替换 / autoGrow 规则 | §5 | `variableEngine.js`（两端共用） |
| 改变量表（schema）注入/权限/持久化 | §10 | `VariablePlugin` + `variableSchema.js` |
| 改图片加载 / 跨域 / 导出 | §6 + §7.4 | `ServersPlugin` / `imageLoader.js` |
| 处理"宿主环境差异"（多副本实例） | §7 | `runtime.js` |
| 新增包内导出、改构建产物 | §8 + §9 | `src/lib/index.js` / `src/lib/renderer.js` / `vue.config.js` |
| 提交前自查 | §11 | 检查清单 + 验证命令 |

> 注：本文件内的章节引用统一用「§编号」，避免依赖渲染器生成的锚点。

### 0.3 文档地图

| 节 | 一句话 |
| --- | --- |
| §1 | 分层总览：引擎 / 插件 / 纯函数 / 运行时层 / 构建期工具 |
| §2 | `PluginEngine` 基类：插件拿到的**全部**引擎能力面 |
| §3 | `Editor` 与 `RendererCore` 的差异与各自铁律 |
| §4 | 渲染器的两个核心插件 + 标准渲染编排（6 步管线） |
| §5 | 共享纯函数层清单 + 背景几何公式（含历史教训） |
| §6 | 两侧共用的加载 / 导出管线 |
| §7 | 运行时能力层：单实例注入、素材解析、渲染守卫、CORS 回退 |
| §8 | 构建期宿主契约：`loader/`（webpack 插件 / 素材 loader）与 `types/` |
| §9 | 对外导出面（改这里等于改契约） |
| §10 | 变量 Schema 注入体系（契约 / 铁律 / 注入面 / UI / 验证） |
| §11 | 开发约束与检查清单 + 验证命令 + 测试约定 |

---

## 1. 架构总览

```
                 ┌──────────────────────────────────────────────┐
                 │                PluginEngine（基类）            │
                 │  pluginMap / hooksEntity / _bindPlugin        │
                 │  getPlugin / off / destroy / _initHooks        │
                 └──────────────▲──────────────────▲──────────────┘
                                │ extends          │ extends
              ┌─────────────────┴─────────┐  ┌─────┴──────────────────────────┐
              │        Editor（编辑器）     │  │      RendererCore（渲染器）      │
              │  编辑能力齐全（交互/快捷键/  │  │  只读呈现、无编辑能力、体积小      │
              │  右键菜单/API 代理）        │  │  固定注册渲染插件                 │
              └──────────┬──────────────┘  └──────┬───────────────────────────┘
                         │                        │
         ┌───────────────┼──────────────┐  ┌──────┼──────────────────────┐
         │               │              │  │      │                      │
   ┌─────▼────┐   ┌──────▼───────┐  ...  │  ┌─────▼──────────┐  ┌────────▼────────┐
   │Workspace │   │ServersPlugin │ 编辑插件│  │RendererWorkspace│  │RendererAutoGrow │
   │Plugin    │   │（两侧共用）    │       │  │Plugin          │  │Plugin           │
   └─────┬────┘   └──────┬───────┘        │  └─────┬──────────┘  └─────────────────┘
         │               │                │        │
         ▼               ▼                │        ▼
   ┌──────────────────────────────────────┴────────────────────────────────────┐
   │ 共享纯函数层（无副作用、两端可复用）                                         │
   │ workspaceGeometry / variableEngine / variableSchema / jsonOptimizer         │
   │ / objectDefaults / assetUrl / generators / workspaceGeometry / renderPatches │
   └────────────────────────────────────────────────────────────────────────────┘
                         ▲                        ▲
                         │                        │
   ┌─────────────────────┴────────────────────────┴─────────────────────────────┐
   │ 运行时能力层（跨引擎、面向宿主环境；见 §7）                                    │
   │ runtime.js（单实例注入）/ patchImageRender.js                                 │
   │ / imageLoader.js（CORS 回退与画布污染标记）                                   │
   └────────────────────────────────────────────────────────────────────────────┘
                         ▲
   ┌─────────────────────┴──────────────────────────────────────────────────────┐
   │ 构建期宿主契约（不参与运行时；见 §8）：types/*.d.ts（对外类型）                │
   └────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 关键文件索引

| 关注点 | 文件 |
| --- | --- |
| 引擎基类 | `src/core/PluginEngine.js` |
| 编辑器引擎 / 渲染引擎 | `src/core/Editor.js` / `src/core/RendererCore.js` |
| 插件目录 | `src/core/plugin/*.js`（编辑插件 + `Renderer*Plugin`） |
| 加载 / 导出管线 | `src/core/ServersPlugin.js` |
| 共享纯函数 | `src/core/{workspaceGeometry,variableEngine,variableSchema,jsonOptimizer,objectDefaults,assetUrl,generators}.js` |
| 运行时能力 | `src/core/{runtime,patchImageRender,imageLoader}.js` |
| 组件外壳 | `src/lib/FabricEditor.vue` / `src/lib/FabricRenderer.vue` |
| 包入口 | `src/lib/index.js`（编辑器）/ `src/lib/renderer.js`（渲染器） |
| 对外类型 | `types/index.d.ts` / `types/fabric-renderer.d.ts` |
| 构建脚本 | `vue.config.js` + `package.json` 的 `build:lib*` |

---

## 2. PluginEngine 基类（`src/core/PluginEngine.js`）

所有插件对引擎的全部依赖面，都收敛在这一个类上。

| 成员 | 说明 |
| --- | --- |
| `constructor` | 初始化 `pluginMap = {}`、`hooksEntity = {}`（子类勿忘 `super(...arguments)`）；`setMaxListeners(0)`（属性面板组件量大，固定阈值会误报） |
| `_initHooks(hookNames?)` | 为 `PLUGIN_HOOKS`（或自定义子集）创建 tapable `AsyncSeriesHook(['data'])`，存入 `this.hooks` / `this.hooksEntity` |
| `_bindPlugin(plugin, options?)` | `new plugin(canvas, this, options)` → 存 `pluginMap` → `bindPluginHooks` 挂钩子；**`use()` 内部必须复用** |
| `getPlugin(name)` | 返回插件实例；不存在返回 `null`（**不要依赖抛错**） |
| `off` / `destroy` | `off` 需容忍 listener 为 undefined；`destroy` 清空 `pluginMap`/`hooksEntity`，子类先做自身资源清理再 `super.destroy()` |

**Hook 契约**（`src/core/plugin/BindPluginHooks.js`，两端完全一致）：
`hookImportBefore` / `hookImportAfter` / `hookSaveBefore` / `hookSaveAfter` / `hookTransform`。
插件只需定义同名方法，`bindPluginHooks` 自动以 `tapPromise` 挂载；返回值会被包装成 Promise。

**基类差异留给子类的两处**：
- hooks 初始化时机：`Editor` 在 `init(canvas)` 时；`RendererCore` 在构造函数内。
- `use()` 各自的额外行为（见 §3）。

---

## 3. 两个引擎的差异与约定

### 3.1 Editor（`src/core/Editor.js`）——编辑器，能力齐全
- `use(plugin, options)`：`_checkPlugin`（重名/事件/API 冲突抛错）→ `_saveCustomAttr` → `_bindPlugin` → `_bindingHotkeys` → `_bindingApis`（API 代理到 `editor` 实例上）。
- `init(canvas)`：设置 canvas → 重置 `pluginMap` → 右键菜单 → `_initActionHooks()`（即 `_initHooks(this.hooks)`）→ 内置 `ServersPlugin`；随后安装远程图片 CORS 回退（`installImageCorsFallback`）并监听 `image:cors-fallback`（标记 `canvasTainted`，供宿主提示导出受限）。
- `destory()`：解绑 CORS 监听 → 清自身字段（`canvas` / `contextMenu` / `customEvents` / `customApis`）→ `super.destroy()`。

### 3.2 RendererCore（`src/core/RendererCore.js`）——渲染器，纯净
- **构造即注册**，固定且只注册渲染所需：
  `ServersPlugin`、`QrCodePlugin`、`BarCodePlugin`、`RendererWorkspacePlugin`、`RendererAutoGrowPlugin`、可选的 `FontPlugin`（`options.getFonts` 提供时）。
- `use()`：缺省守卫（空插件 / 缺 `pluginName` / 已注册 → 直接返回 `this`），不抛错、无快捷键/API 代理。
- `loadJSON(json, callback?)`：Promise 封装，复用 `ServersPlugin.loadJSON` 全管线；默认 `crossOrigin='anonymous'`。
- `destroy()`：先 `canvas.dispose()` 再 `super.destroy()`。

### 3.3 铁律
1. **不要向 RendererCore 添加编辑能力**（撤销、选择、变换、右键、快捷键、Ruler、图层……一概不进）。
2. **渲染业务只进插件**：`RendererWorkspacePlugin` / `RendererAutoGrowPlugin`，不得直接写在 `RendererCore` 或 `FabricRenderer.vue`。
3. **新渲染能力 = 新渲染插件**，遵循「插件命名 `RendererXxxPlugin`、`pluginName` 前缀 `Renderer`」约定。

---

## 4. 渲染器核心插件与渲染编排

### 4.1 RendererWorkspacePlugin（`src/core/plugin/RendererWorkspacePlugin.js`）
对应编辑器 `WorkspacePlugin`，但零编辑依赖。职责：

| 方法/钩子 | 说明 |
| --- | --- |
| `hookImportAfter(json)` | 加载后自动执行：解析 JSON → 建立 `designMap`/`designHeight`（设计态基准）→ workspace 只读化（不可选/不可触发）→ 画布尺寸=workspace 尺寸 → 视口平移把 workspace 原点映射到画布 (0,0) → 克隆 workspace 作为 `clipPath` |
| `getWorkspace()` / `getBackgroundImageObj()` | 顶层对象查询（`id === 'workspace'` / `'backgroundImage'`） |
| `resizeSilent(height)` | 静默增高（对应编辑器 `setSizeSilent`）：改 workspace 高度 + 背景重排 + 画布高 + clip 跟随 |
| `relayoutBackground()` | **按图片原始尺寸重排背景**（cover/contain/tile）。编辑器保存 JSON 时背景的 scaleX/scaleY 可能被「缺省字段精简」剔除（等于 1），渲染器必须在图片就绪后重排一次 |
| `setBackgroundImage(src, mode, align, cb)` / `removeBackgroundImage` / `getBackgroundImage` | 背景图增删查（与编辑器语义一致） |
| `whenImagesLoaded()` | 所有 `fabric.Image` 元素加载/失败完成 → Promise |

### 4.2 RendererAutoGrowPlugin（`src/core/plugin/RendererAutoGrowPlugin.js`）
对应编辑器 `AutoGrowPlugin`。职责：`apply()` —— 渲染真实数据后按同一规则（`variableEngine.computeAutoGrowSize`）计算增高，follow 元素保持设计态相对间距下移，再 `RendererWorkspacePlugin.resizeSilent(height)` 增高。

### 4.3 渲染编排（`src/lib/FabricRenderer.vue`）
标准渲染管线，新增渲染流程必须对齐：

```
render()
  1) renderObjects(raw, data, delimiter)  变量替换（深拷贝，不污染传入 JSON）
  2) core.loadJSON(substituted)           全管线 + hookImportAfter（workspace 呈现+设计态基准）
  3) autoGrow.apply()                     增高（与编辑器预览同规则）
  4) workspacePlugin.whenImagesLoaded()   等图片就绪
  5) workspacePlugin.relayoutBackground() 按原图尺寸重排背景
  6) emit('rendered', { core, canvas })
```

---

## 5. 共享纯函数层（单一事实来源）

所有几何/序列化/变量计算都在纯函数模块中，**编辑器与渲染器必须调用同一模块，禁止两套实现**。

| 模块 | 关键导出 | 用途 |
| --- | --- | --- |
| `workspaceGeometry.js` | `computeBackgroundLayout` / `cloneWorkspaceAsClip` / `createBackgroundObject` / `alignToFactor` | 背景 cover/contain/tile 布局、clip 克隆兜底、背景对象创建 |
| `variableEngine.js` | `render` / `renderObjects` / `extractVariables` / `computeAutoGrowSize` / `DEFAULT_DELIMITER` | 变量替换与 autoGrow 计算 |
| `variableSchema.js` | `mergeVariableSchema` / `applySchemaDefaults` / `applySchemaDefaultsFlat` / `applySchemaExamplesFlat` / `resolveRenderSchema` / `inferVariableType` / `validateVariableDef` | 变量表对齐、默认值补齐、示例预填、C 端 schema 解析优先级、类型推断 |
| `jsonOptimizer.js` | `stripDefaultFields` / `normalizeDefaultFields` / `stripCanvasDefaults` / `normalizeCanvasDefaults` / `patchImageCrossOrigin` | JSON 瘦身（编辑端剔除缺省字段）与还原（渲染端补回） |
| `objectDefaults.js` | `OBJECT_DEFAULTS` / `getDefaultsForType` | 各类对象缺省值 |
| `assetUrl.js` | `normalizeAssetUrl` / `appendCacheBustParam` | 资源 URL 归一与分片缓存参数 |
| `generators.js` | `generateQrCodeDataURL` / `generateBarcodeDataURL` / `qrParamsToOption` | 二维码/条形码参数化生成（JSON 不存 base64，加载时再生成） |
| `renderPatches.js` | — | fabric 对象补丁（副作用，构造引擎前 import 一次） |
| `BindPluginHooks.js` | `PLUGIN_HOOKS` / `bindPluginHooks` | hook 契约与绑定 |

### 5.1 背景几何公式（`computeBackgroundLayout`）

采用**标准 cover/contain** 语义（已与编辑器 `WorkspacePlugin` 收敛一致，勿再改回旧「交换式」）：

- `rectRatio = rectW / rectH`，`imgRatio = imgW / imgH`
- **contain（整体可见，取较小缩放）**：`scale = rectRatio > imgRatio ? rectH / imgH : rectW / imgW`
- **cover（铺满裁剪，取较大缩放）**：`scale = rectRatio > imgRatio ? rectW / imgW : rectH / imgH`
- 对齐：`alignToFactor`（支持 CSS 风格 `'center'`、`'top left'`、`'bottom right'`…）

> ⚠️ 历史教训：旧实现两个分支写成「交换式」（cover 在部分比例下表现成 contain），两端行为不一致导致渲染器背景变形。回归测试 `workspace.test.js`、`renderer.test.js` 已按标准公式断言，改动需同步更新。

---

## 6. 加载 / 导出管线（`ServersPlugin`）

编辑与渲染共用同一实例化管线，保证两端结果一致：

- `loadJSON(jsonFile, callback, crossOrigin='anonymous')`
  - 资源清单展开（`assetId` 引用 → 内联 `src`，编辑器 `useAssetManifest` 产出的精简 JSON 对称还原）
  - 缺省字段补回（`normalizeCanvasDefaults`）
  - 二维码/条形码参数还原（`qrParamsToOption` + generators，重建 base64）
  - 远程图片 `patchImageCrossOrigin`（避免 Tainted canvas 导致 `toDataURL` 导出 `SecurityError`；`crossOrigin` 传 `null` 可关闭，此时仅可显示不可导出）
  - 字体加载（`FontPlugin` 可选）
- 导出（**带倍数缩放**，编辑器默认 `1`，渲染器可传 `2` 出高清图）：
  - `preview(multiplier = 1)` → dataURL
  - `saveImg(multiplier = 1)` → 下载
  - `_getSaveOption(multiplier = 1)` → 底层选项
  - API 代理 `editor.exportFile(type, multiplier)` / `editor.preview(multiplier)`

> 新增加载/导出逻辑必须放在 `ServersPlugin`（或它调用的纯函数），编辑与渲染两侧自动同时生效。

---

## 7. 运行时能力层（宿主环境适配）

这一层不参与业务逻辑，解决的是**"同一份产物在任意宿主里都要正确工作"**的问题。改动它们时会同时影响两个引擎，务必回归两端。

### 7.1 `runtime.js`（单实例注入门面）
- **问题**：依赖树出现第二份 `vue` 或 `@vue/composition-api` 时，分别导致 `_vm.$t is not a function`、`The setup binding property "..." is already declared`。
- **机制**：消费方入口调用 `installRuntime({ vue, compositionApi })` 注入单例；门面把所有 composition-api API 包装为**调用期取值**（注入晚于 import 也生效）；`onRuntimeReady(cb)` 处理模块加载期的全局注册（如 `Vue.use(VueI18n)` 补注册一次，幂等）。
- **约束**：未注入时必须回退为"构建解析到的实例"（向后兼容），并在开发环境给一次可操作提示；`src/lib/i18n.js`、`src/language/index.js` 是仅有的两个模块加载期注册点。
- **构建配合**：`vue.config.js` 在 lib 构建中把 `@vue/composition-api$` 精确 alias 到 `src/core/runtime.js`，门面自身用深层路径懒加载真实包（external），因此源码里的 `import { ref } from '@vue/composition-api'` 无需改动。

### 7.2 画布素材（1.0.4 起内联，无独立模块）
- **问题（历史）**：素材曾是 file-loader 产出的 `__webpack_require__.p + "x.svg"`，宿主不会复制包内文件 → 404 → 控件图标 broken → `drawImage` 抛 `InvalidStateError`；当时以 `canvasAsset.js`（运行时基址）+ `loader/`（webpack 改写）解决。
- **现状**：素材引用全部改为**宿主可自行处理**的形态——5 个控件图标在 JS 内联为 data URI（`!!raw-loader!` + `svgDataUri()`，见 `utils.js`）；8 张滤镜缩略图经 `Filters.vue` 的 CSS 相对 `url()` 引用，宿主 CSS 管线自动产出/重写。`canvasAsset.js` 与 `loader/` 已删除（迁移说明见 [PACKAGING.md §4.5](./PACKAGING.md)）。
- **约束**：**新增画布素材必须沿用同样模式**——JS 侧绘制用 raw-loader + data URI，DOM 展示走 CSS `url()`；不要再引入 JS 侧的外部文件 URL。

### 7.3 `patchImageRender.js`（渲染守卫）
- **问题**：容器布局未就绪时初始化 → `Image._element` 或 `canvas.clipPath._cacheCanvas` 为 0×0 → `drawImage` 抛 `InvalidStateError`，整次 `renderAll` 中断、画布空白（编辑器在路由跳转挂载时最易触发）。
- **机制**：`installImageRenderGuard()`（幂等，两个引擎入口都调用）守卫 `Image.prototype._renderFill` 与 `StaticCanvas.prototype.drawClipPathOnCanvas`；clipPath 0×0 时跳过并标 `dirty` 以便尺寸就绪后重建。
- **约束**：新增"把资源画到画布"的逻辑时，需容忍元素尺寸为 0（跳过绘制而非抛错）。

### 7.4 `imageLoader.js`
- `loadImageResilient(url, { crossOrigin })`：crossOrigin 失败自动去 crossOrigin 重试（保显示，代价是画布被污染、导出受限）。
- `installImageCorsFallback()` / `addCorsFallbackListener()`：包装 `fabric.util.loadImage`，回退发生时回调（`Editor` 借此标记 `canvasTainted` 并 `emit('image:cors-fallback')`）。
- **约束**：涉及导出的功能必须考虑"画布可能已被污染"，导出失败要有明确提示（`save-error`）。

---

## 8. 构建期宿主契约（`types/`）

这部分**不参与运行时**，是对外类型契约；改动需同步 `package.json` 的 `files` / `exports` 与 [PACKAGING.md](./PACKAGING.md)。

| 文件 | 作用 |
| --- | --- |
| `types/*.d.ts` | 对外类型（Props / 事件 / api / 扩展协议 / `installRuntime` 等），**手写维护**，改契约必须同步 |

> 历史上的 `loader/`（webpack 插件 + 素材 loader）已随「画布素材内联」删除（见 §7.2 / PACKAGING §4.5）。

---

## 9. 对外导出面（勿随意改动）

- `src/core/index.js`（引擎 barrel）：导出 `Editor`、全部编辑插件、`RendererCore`、`RendererWorkspacePlugin`、`RendererAutoGrowPlugin`、共享纯函数、`createBackgroundObject` 等。
- `src/lib/index.js`（编辑器包入口）：`FabricEditor`、`createI18n` / `messages`、注册表 / 扩展 / api 工厂、hooks、内置可覆盖组件（`TopbarImport`、`RightPanel`）、`installRuntime` / `isRuntimeInjected`、`setCanvasAssetsBaseUrl` / `resolveCanvasAsset`。
- `src/lib/renderer.js`（渲染包入口）：**只导出渲染所需**（`RendererCore`、`ServersPlugin`、两个渲染插件、渲染依赖的纯函数、`fabric`、`FabricRenderer`、`installRuntime`）。**勿引入编辑插件 / UI**。
- 打包脚本：`build`（应用站点）、`build:lib`（主库）、`build:lib:renderer`（渲染包）。改导出面后三个构建都要过。

---

## 10. 变量 Schema（变量字典）注入体系

> 解决「变量占位符纯手打 + 变量表游离在工作流外」的割裂问题：
> 业务定义变量表 → 业务无关协议注入编辑器 → 插入变量/对齐视图/收编 → 渲染容错。

### 10.1 数据契约（`types/index.d.ts`）

- `VariableDef`：`{ path, label, type: 'text'|'image'|'qrcode'|'barcode', example?, defaultValue?, description? }`。
  `path` 是唯一键且**创建后不可改**（画布占位符的锚点）。
- `VariableSchemaAdapter`：`{ list(): Promise<VariableDef[]>; save?(defs): Promise<void> }`。
  `save` 为全量保存（业务侧自 diff，last-write-wins）；未实现时编辑器降级为「导出变量表 JSON」。
- `VariableMeta`：模板持久化的变量元数据（保存时派生，见 §10.2 第 1 条）——
  `{ version?, delimiter?, schema?: VariableMetaDef[] }`。

### 10.2 铁律

1. **schema 的持久化形态 = variableMeta.schema 模板快照（双形状）**：会话态权威在「VariablePlugin 内存 + 业务后台」；模板 JSON 持久化的是保存那一刻的快照，不进 `jsonOptimizer` 对称链。两条导出链路（`ServersPlugin.getJson(complete)` 分流）：
   - **完整导出**（`saveJson` 下载）：`schema` = 全量会话表（未用变量也带——现在没用 ≠ 以后不用，重开即可插入）+ 画布已用未定义路径合成 def（label=path、类型按占位字段推断、src=custom）；条目带 `src`（imported/custom）来源标记，回导时还原编辑权限。
   - **精简导出**（剪贴板 / `save-request` 提交，C 端专用）：`schema` 仅含「已使用 ∧ 非空 defaultValue」的 `{ path, defaultValue }`，保证 C 端 defaultValue 回退与业务后台一致。
   - 旧契约 `variables[]`（`{ path, name, example, required }`）仅导入兼容读取，不再写出。
2. **计算全在 `variableSchema.js` 纯函数**：对齐（`mergeVariableSchema`）、默认值（`applySchemaDefaults` 嵌套语义 / `applySchemaDefaultsFlat` 扁平映射表语义）、预览值预填（`applySchemaExamplesFlat`）、C 端 schema 解析优先级（`resolveRenderSchema`：显式注入 > 模板快照，不 merge）、类型推断（`inferVariableType`）、定义校验（`validateVariableDef`）。编辑器预览与 C 端渲染共用同一实现。**C 端不做任何校验**。
3. **导入仅禁删**：`adapter.list()` / `api.setVariableSchema` / 快照 `src:'imported'` 的变量标记为 imported（`_schemaImportedPaths`），UI 与插件层仅限制删除（`removeCustomVariable` 拒绝），编辑/预览值/默认值与自定义变量权限一致；编辑器内新建的是自定义变量，随快照持久化可跨会话存活，业务 `adapter.save` 吸收后下次注入成为权威（adapter 拉取按 path 覆盖快照，业务权威优先）。
4. **两个值的语义边界**（example ≙ testData 同义，均为测试数据——预设或修改后）：`example`=测试数据的持久化形态（快照写出优先级：testData 已填值**含空串** > 业务预设 > `''`；schema 注入/收编/快照还原时预填 testData 缺失 key）；`defaultValue`=渲染缺失回退（预览与 C 端渲染共用，精简导出唯一保留字段）。
5. **默认值语义两端一致**：缺失判定 = `getValueByPath` 为 `undefined/null`（先精确匹配顶层扁平 key，再点路径下钻）；空串视为已提供，不覆盖；编辑器 `testData` 走扁平写入（`applySchemaDefaultsFlat`），C 端 `data` 走嵌套写入（`applySchemaDefaults`）。

### 10.3 注入面

| 渠道 | 用法 |
| --- | --- |
| adapter（推荐） | `FabricEditor` props `adapters.variable`（与 font/size 同构，registry key `variable`）；ready 时绑定到 `VariablePlugin`，**懒加载**（首次 `ensureSchemaLoaded()` 才拉取） |
| api 静态注入 | `api.setVariableSchema(defs)` / `api.getVariableSchema()`（无接口场景，视为导入，不可删除） |
| 渲染端 | `FabricRenderer` props `schema`（或 `options.schema`）：渲染前 `applySchemaDefaults` 默认值回退；**未注入时回读模板自带 `variableMeta.schema`**（`resolveRenderSchema`），完整/精简导出均自包含可渲染 |

### 10.4 UI 与联动

- `VariableConfigModal`：① 包裹符 ② **变量表单表**（定义展示 + 预览值填写一体）——
  列：变量(label+path) / 类型 / 默认值（仅展示，编辑入口在新建/编辑表单） / 预览值(绑 testData，≙ form.example 同源) / 操作（icon 化；使用状态不用列展示：未使用行浅底色示意）；
  行分三种：导入（可编辑、无删除）/ 自定义（编辑·删除）/ 未定义（红色 path，收编）；
  表下动作：新建变量 / **批量创建** / 保存（adapter.save）或导出 JSON；预览/还原与关闭合并至 Modal footer。
  **批量创建**：每行一条 `path` 或 `path,名称` 或 `path,名称,预览值`（逗号/｜/Tab 分隔，第 3 段起合并为预览值并预填 def.example + testData），或直接粘贴 `exportVariableSchema` 导出的 JSON（裸数组 / variableMeta `{schema:[...]}` 形状，def 全字段随行携带、各自类型生效）；统一类型 + 实时解析预览（汇总「可创建 n · 重复跳过 m」）+ 冲突跳过；
  打开时预载画布未定义变量行（label 留空回退为 path），一次填完即「一键收编全部」。
  未注入 schema 时表格展示画布扫描行（等价旧测试数据表）+ 引导文案（预览能力零损失）。
- **开发者后门（仅开发联调）**：`VariablePlugin.setSchemaEditable(true)` / `api.setSchemaEditable(true)` 跳过 imported 只读限制（导入变量可删除），`false` 恢复只读；`FabricEditor` ready 时按 `?varEdit=1` 或 `localStorage['fe:variable-editable'] === '1'` 自动解锁。开关仅改权限判定、不重建 `_schemaImportedPaths`，可逆；但解锁后 `saveVariableSchema` 仍会全量覆盖后端，慎用。
- `VariableInsertPopover`：Input append 触发器 + 搜索 + 类型严格过滤（文本入口只列 text、图片入口只列 image、二维码/条形码入口各列自身类型）；组件**只负责展示与选择**，写入由接入方完成。可用性判断在**接入点 append 槽位级守卫**（`varSchemaAvailable`，避免空 append 盒），接入点：`AttributeTextContent`（文本）、`AttributeOnlineImg` / `ImagePickerModal`（图片 URL，光标插入支持模板串）、`AttributeQrCode`（二维码内容）、`AttributeBarcode`（条形码代码，插入即经 setBarcode/setQrCode 同步画布）。
- 事件：`variable:schemaChange`（schema 变更统一出口：先 `example` 预填 testData，预览态下再补默认值并重刷预览）。
- `useTestData` 透出：`schema` / `schemaLoading` / `schemaAvailable` / `ensureSchemaLoaded` / `addCustomVariable` / `updateCustomVariable` / `removeCustomVariable` / `saveSchema` / `exportSchema` / `isImportedVariable`。

### 10.5 验证

- `variableSchema.test.js`：纯函数（对齐/默认值/示例预填/渲染 schema 优先级/推断/清洗）。
- `variableSchemaPlugin.test.js`：插件契约（注入/懒加载/并发去重/失败重试/CRUD 权限/保存导出/画布扫描/example 预填/variableMeta 快照双形状与导入还原/预览联动）。
- `exportPipeline.test.js`：双模式导出（精简态 defaultValue 回退项 / 完整态全量快照）。
- `renderer.test.js`「变量表 schema 渲染容错」：默认值回退 + 未传 schema 零开销。
- `editorApiVariable.test.js`：api 层签名透传。

---

## 11. 开发约束与检查清单

### 11.1 新增渲染能力（新图层类型渲染、特效等）

- [ ] 引擎侧零改动：业务放 `RendererXxxPlugin`（复用基类契约），或放共享纯函数。
- [ ] 几何/序列化逻辑放进 `workspaceGeometry.js` / `jsonOptimizer.js` 等纯函数模块，编辑器插件复用同一函数。
- [ ] 依赖另一端已有行为时，检查是否也应同步到编辑器插件（两端一致），而非只在渲染侧实现。
- [ ] JSON 序列化遵守「编辑器瘦身、渲染器补回」对称约定：新增可缺省字段要同时进 `objectDefaults` / `jsonOptimizer`。
- [ ] 远程图片一律带 `crossOrigin`；涉及导出必须考虑 Tainted canvas。
- [ ] 导出倍数：渲染器高清导出用 `core.getPlugin('ServersPlugin').preview(2)`。
- [ ] 插件注册注意 `pluginName` 唯一、渲染插件前缀 `Renderer`。
- [ ] 出口文件：用到渲染包则在 `src/lib/renderer.js` 导出，测试是否影响 tree-shaking。
- [ ] 变量表（schema）相关：会话态权威在业务后台（adapter/api 注入）与 `VariablePlugin` 内存；模板 JSON 只允许 `variableMeta.schema` **快照**（保存时派生，见 §10.2），**禁止把 schema 塞进 jsonOptimizer 对称链**；schema 计算一律走 `variableSchema.js` 纯函数。

### 11.2 新增编辑能力 / 宿主适配（运行时层）

- [ ] 编辑能力 = 新插件（`src/core/plugin/`）+ 在 `FabricEditor.vue` 的 `.use()` 链注册；`pluginName` / `apis` / `events` 全局唯一。
- [ ] hooks 必须返回 Promise 或值，**不要吞异常**（`AsyncSeriesHook` 会因此静默中断加载管线）。
- [ ] 插件 `destroy()` 里解绑自身监听的 canvas / editor 事件。
- [ ] 新增"把资源画到画布"的逻辑：容忍 0 尺寸元素（见 §7.3），不要直接 `drawImage`。
- [ ] 新增画布素材：JS 绘制用 raw-loader + `svgDataUri()` 内联；DOM 展示走组件内 CSS `url()` 相对引用——**不要引入 JS 侧外部文件 URL**（见 §7.2）。
- [ ] 触及宿主实例的代码（vue / composition-api）：走 `runtime.js` 门面，别直接 `require('vue')`。
- [ ] 改对外 API / Props / 事件 / 扩展协议：同步 `types/*.d.ts` 与 [README](./README.md) 组件文档。

### 11.3 验证命令

```bash
npx jest                        # 全量单测（当前 37 套件 / 450 用例）
npx jest tests/runtimeFacade.test.js   # 单跑某几个套件
npm run lint                    # 代码规范
npm run typecheck               # types/*.d.ts 冒烟
npm run build                   # 应用站点
npm run build:lib               # 主库
npm run build:lib:renderer      # 渲染包
```

### 11.4 测试约定

- `renderer.test.js` 用 `createRenderer()` + `wsPlugin(core)` / `autoGrowPlugin(core)` 助手，断言走插件公开方法，不触碰内部状态。
- `pluginEngine.test.js` 校验基类契约（hooks 创建/绑定/清理、`Editor` 与 `RendererCore` 继承关系）。
- `variableSchema.test.js` / `variableSchemaPlugin.test.js` 校验变量表纯函数与 `VariablePlugin` 扩展契约。
- `runtimeFacade.test.js` 校验单实例门面（回退 / 注入 / 幂等 / 互操作解包 / `onRuntimeReady` 时序）。
- CSS / `qr-code-styling` 等在 node 环境需 `jest.mock(..., { virtual: true })` 兜底，参考已有测试头部。

---

## 相关文档

| 文档 | 内容 |
| --- | --- |
| [README.md](./README.md) | 快速上手、组件 API、扩展示例、二次开发入口 |
| [PACKAGING.md](./PACKAGING.md) | 打包 / 集成 / 发布；§4.5 画布素材契约、§4.6 运行时单实例注入 |
| [types/](./types) | 对外类型声明（Props / 事件 / api / 扩展协议） |
| [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) | 第三方代码与资源清单 |
