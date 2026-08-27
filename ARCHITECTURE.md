# 架构规范：编辑器 / 渲染器 双引擎插件化

> 版本：vue-fabric-editor 重构基线（RendererCore 纯净化 + PluginEngine 基类）
> 适用范围：本仓库所有与「FabricEditor 编辑器」「FabricRenderer 前台渲染」相关的后续迭代。

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
              │  右键菜单/API 代理）        │  │  固定注册 5 个渲染插件            │
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
   │ workspaceGeometry.js / variableEngine.js / jsonOptimizer.js / objectDefaults │
   │ / assetUrl.js / generators.js / renderPatches.js / BindPluginHooks.js        │
   └────────────────────────────────────────────────────────────────────────────┘
```

- **引擎 = 容器**：Editor 与 RendererCore 都只是「fabric canvas + 插件注册 + 加载管线」，业务逻辑全部下沉到插件。
- **插件 = 能力单元**：声明式注册（`pluginName`），生命周期钩子（`hookImportAfter` 等）通过 tapable 挂到 `hooksEntity`。
- **共享纯函数层 = 单一事实来源**：两边必须复用同一实现，禁止复制粘贴或另写一套。

---

## 2. PluginEngine 基类（`src/core/PluginEngine.js`）

所有插件对引擎的全部依赖面，都收敛在这一个类上。

| 成员 | 说明 |
| --- | --- |
| `constructor` | 初始化 `pluginMap = {}`、`hooksEntity = {}`（子类勿忘 `super(...arguments)`） |
| `_initHooks(hookNames?)` | 为 `PLUGIN_HOOKS`（或自定义子集）创建 tapable `AsyncSeriesHook(['data'])`，存入 `this.hooks` / `this.hooksEntity` |
| `_bindPlugin(plugin, options?)` | `new plugin(canvas, this, options)` → 存 `pluginMap` → `bindPluginHooks` 挂钩子；**`use()` 内部必须复用** |
| `getPlugin(name)` | 返回插件实例；不存在返回 `null`（**不要依赖抛错**） |
| `off` / `destroy` | `off` 需容忍 listener 为 undefined；`destroy` 清空 `pluginMap`/`hooksEntity`，子类先做自身资源清理再 `super.destroy()` |

**Hook 契约**（`src/core/plugin/BindPluginHooks.js`，两端完全一致）：
`hookImportBefore` / `hookImportAfter` / `hookSaveBefore` / `hookSaveAfter` / `hookTransform`。
插件只需定义同名方法，`bindPluginHooks` 自动以 `tapPromise` 挂载；返回值会被包装成 Promise。

**基类差异留给子类的两处**：
- hooks 初始化时机：`Editor` 在 `init(canvas)` 时；`RendererCore` 在构造函数内。
- `use()` 各自的额外行为（见下）。

---

## 3. 引擎差异与约定

### 3.1 Editor（`src/core/Editor.js`）——编辑器，能力齐全
- `use(plugin, options)`：`_checkPlugin`（重名/事件/API 冲突抛错）→ `_saveCustomAttr` → `_bindPlugin` → `_bindingHotkeys` → `_bindingApis`（API 代理到 `editor` 实例上）。
- `init(canvas)`：设置 canvas → 重置 `pluginMap` → 右键菜单 → `_initActionHooks()`（即 `_initHooks(this.hooks)`）→ 内置 `ServersPlugin`。
- `destory()`：先清自身字段，再 `super.destroy()`。

### 3.2 RendererCore（`src/core/RendererCore.js`）——渲染器，纯净
- **构造即注册**，固定且只注册渲染所需：
  `ServersPlugin`、`QrCodePlugin`、`BarCodePlugin`、`RendererWorkspacePlugin`、`RendererAutoGrowPlugin`、可选的 `FontPlugin`（`options.getFonts` 提供时）。
- `use()`：缺省守卫（空插件 / 缺 `pluginName` / 已注册 → 直接返回 `this`），不抛错、无快捷键/API 代理。
- `loadJSON(json, callback?)`：Promise 封装，复用 `ServersPlugin.loadJSON` 全管线；默认 `crossOrigin='anonymous'`。
- `destroy()`：先 `canvas.dispose()` 再 `super.destroy()`。

### 3.3 铁律
1. **不要向 RendererCore 添加编辑能力**（撤销、选择、变换、右键、快捷键、Ruler、图层……一概不进）。
2. **渲染业务只进插件**：`RendererWorkspacePlugin` / `RendererAutoGrowPlugin`，不得直接写在 RendererCore 或 FabricRenderer.vue。
3. **新渲染能力 = 新渲染插件**，遵循「插件命名 `RendererXxxPlugin`、`pluginName` 前缀 `Renderer`」约定。

---

## 4. 渲染器两个核心插件

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
| `jsonOptimizer.js` | `stripDefaultFields` / `normalizeDefaultFields` / `stripCanvasDefaults` / `normalizeCanvasDefaults` / `patchImageCrossOrigin` | JSON 瘦身（编辑端剔除缺省字段）与还原（渲染端补回） |
| `objectDefaults.js` | `OBJECT_DEFAULTS` / `getDefaultsForType` | 各类对象缺省值 |
| `assetUrl.js` | `normalizeAssetUrl` | 资源 URL 归一 |
| `generators.js` | `generateQrCodeDataURL` / `generateBarcodeDataURL` / `qrParamsToOption` | 二维码/条形码参数化生成（JSON 不存 base64，加载时再生成） |
| `renderPatches.js` | — | fabric 对象补丁（副作用，构造引擎前 import 一次） |
| `BindPluginHooks.js` | `PLUGIN_HOOKS` / `bindPluginHooks` | hook 契约与绑定 |

### 5.1 背景几何公式（`computeBackgroundLayout`）
采用**标准 cover/contain**语义（已与编辑器 WorkspacePlugin 收敛一致，勿再改回旧「交换式」）：

- `rectRatio = rectW / rectH`，`imgRatio = imgW / imgH`
- **contain（整体可见，取较小缩放）**：`scale = rectRatio > imgRatio ? rectH / imgH : rectW / imgW`
- **cover（铺满裁剪，取较大缩放）**：`scale = rectRatio > imgRatio ? rectW / imgW : rectH / imgH`
- 对齐：`alignToFactor`（支持 CSS 风格 `'center'`、`'top left'`、`'bottom right'`…）

> ⚠️ 历史教训：旧实现两个分支写成「交换式」（cover 在部分比例下表现成 contain），两端行为不一致导致渲染器背景变形。回归测试 `workspace.test.js`、`renderer.test.js` 已按标准公式断言，改动需同步更新。

---

## 6. ServersPlugin：两侧共用的一条加载/导出管线（`src/core/ServersPlugin.js`）

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

> 新增加载/导出逻辑必须放在 ServersPlugin（或它调用的纯函数），编辑与渲染两侧自动同时生效。

---

## 7. 对外导出面（勿随意改动）

- `src/core/index.js`（主库入口）：导出 `Editor`、全部编辑插件、`RendererCore`、`RendererWorkspacePlugin`、`RendererAutoGrowPlugin`、共享纯函数、`createBackgroundObject` 等。
- `src/lib/renderer.js`（fabric-renderer 包入口）：**只导出渲染所需**（RendererCore、ServersPlugin、两个渲染插件、渲染依赖的纯函数、`fabric`、`FabricRenderer`）。新增渲染导出放这里，勿引入编辑插件/UI。
- 打包脚本：`build`（应用）、`build:lib`（主库）、`build:lib:renderer`（渲染包）。改导出面后三构建都要过。

---

## 8. 开发约束与检查清单

**新增一个渲染能力（如新的图层类型渲染、特效）时，按此清单自查：**

- [ ] 引擎侧零改动：业务放 `RendererXxxPlugin`（继承/复用基类契约），或放共享纯函数。
- [ ] 几何/序列化逻辑放进 `workspaceGeometry.js` / `jsonOptimizer.js` 等纯函数模块，编辑器插件复用同一函数。
- [ ] 依赖另一端已有行为时，检查是否也应同步到编辑器插件（两端一致），而非只在渲染侧实现。
- [ ] JSON 序列化遵守「编辑器瘦身、渲染器补回」对称约定：新增可缺省字段要同时进 `objectDefaults` / `jsonOptimizer`。
- [ ] 远程图片一律带 `crossOrigin`；涉及导出必须考虑 Tainted canvas。
- [ ] 导出倍数：渲染器高清导出用 `core.getPlugin('ServersPlugin').preview(2)`。
- [ ] 插件注册注意 `pluginName` 唯一、渲染插件前缀 `Renderer`。
- [ ] 出口文件：用到渲染包则在 `src/lib/renderer.js` 导出，测试是否影响 tree-shaking。

**验证命令：**
```
npx jest                      # 全量单测（当前 157 通过）
npm run build                 # 应用
npm run build:lib             # 主库
npm run build:lib:renderer    # 渲染包
```

**测试约定：**
- `renderer.test.js` 用 `createRenderer()` + `wsPlugin(core)`/`autoGrowPlugin(core)` 助手，断言走插件公开方法，不触碰内部状态。
- `pluginEngine.test.js` 校验基类契约（hooks 创建/绑定/清理、Editor 与 RendererCore 继承关系）。
- CSS / qr-code-styling 等在 node 环境需 `jest.mock(..., { virtual: true })` 兜底，参考已有测试头部。