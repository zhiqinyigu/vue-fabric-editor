# 打包 / 集成 / 发布指南

> 版本：`@chenyican/vue-fabric-editor` 基线
> 适用范围：本仓库（github.com/zhiqinyigu/vue-fabric-editor）的构建产物如何被外部业务项目使用，以及本地 `file:` 集成与 npm 发布两种模式的差异与流程。
> npm 包名：`@chenyican/vue-fabric-editor`（scoped；产物目录仍为 `dist/vue-fabric-editor/`，与包名无关）。
> 关联文档：[ARCHITECTURE.md](./ARCHITECTURE.md)（内部双引擎架构与打包脚本），本文件聚焦「对外交付」。

---

## 1. 交付物总览

本仓库对外交付两个包，均为 `vue-cli --target lib` 构建产物：

| 包 | 构建命令 | 产物目录 | 用途 |
| --- | --- | --- | --- |
| 主库 `@chenyican/vue-fabric-editor` | `npm run build:lib` | `dist/vue-fabric-editor/` | 完整编辑器（FabricEditor.vue 外壳 + Editor 引擎 + 全部编辑插件 + 共享纯函数） |
| 渲染包 `fabric-renderer` | `npm run build:lib:renderer` | `dist/fabric-renderer/` | 轻量渲染器（RendererCore + 渲染插件 + 渲染纯函数，无编辑能力） |

两者输出格式一致：`*.common.js`（CommonJS2）、`*.umd.js` / `*.umd.min.js`、`*.css`。

> ⚠️ **产物不能共存于同一目录**：两个 lib 构建若写同一 `dist/` 顶层，后一次的 webpack 清理会删掉前一次产物。因此脚本已用 `--dest` 各自输出到独立子目录（见 [package.json](./package.json) 的 `build:lib:*`）。

### 产物目录结构

```
dist/
├── vue-fabric-editor/
│   ├── vue-fabric-editor.common.js    # CJS 主入口（控件图标已内联为 data URI）
│   ├── vue-fabric-editor.umd.js       # UMD
│   ├── vue-fabric-editor.umd.min.js   # UMD 压缩
│   ├── vue-fabric-editor.css          # 主库样式（滤镜缩略图经相对 url() 引用）
│   └── img/                           # 滤镜缩略图（css-loader 产出，带 hash；宿主 CSS 管线自动处理）
└── fabric-renderer/
    ├── fabric-renderer.common.js      # CJS 主入口
    ├── fabric-renderer.umd.js         # UMD
    ├── fabric-renderer.umd.min.js     # UMD 压缩
    └── fabric-renderer.css            # 渲染器样式
```

（另有各目录下的 `demo.html`，仅本地演示用，不影响消费。）

> ✅ **1.0.4 起：画布素材已内联**。5 个控件图标在 JS 内联为 data URI，8 张滤镜缩略图经 CSS 相对
> `url()` 引用（宿主 CSS 管线自动产出/重写），消费方**零素材接入配置**——历史版本的
> `VfeAssetsPlugin` / `assetsBaseUrl` 已移除（详见 §4.5）。渲染包产物不含任何素材。

> ⚠️ `dist/` **根目录**还会出现 `npm run build` 的应用站点产物（`index.html`、`js/`、`css/`、`fonts/`、`favicon.ico`、根级 svg 等）。
> 它们不是交付物：`files` 只列两个 lib 子目录，故不会被打进 npm 包（详见 §2）。

---

## 2. `package.json` 对外入口字段（已配置）

```jsonc
{
  "name": "@chenyican/vue-fabric-editor",
  "version": "1.0.0",
  "private": false,
  "publishConfig": { "registry": "https://registry.npmjs.org/" },
  "main":   "dist/vue-fabric-editor/vue-fabric-editor.common.js",
  "module": "dist/vue-fabric-editor/vue-fabric-editor.common.js",
  "types":  "types/index.d.ts",
  "style":  "dist/vue-fabric-editor/vue-fabric-editor.css",
  "files":  ["dist/vue-fabric-editor", "dist/fabric-renderer", "types", "fabric-renderer.js"],
  "sideEffects": ["**/*.css", "**/*.less", "**/*.vue"],
  "exports": {
    ".": {
      "types":   "./types/index.d.ts",
      "import":  "./dist/vue-fabric-editor/vue-fabric-editor.common.js",
      "require": "./dist/vue-fabric-editor/vue-fabric-editor.common.js",
      "default": "./dist/vue-fabric-editor/vue-fabric-editor.common.js"
    },
    "./style": "./dist/vue-fabric-editor/vue-fabric-editor.css",
    "./fabric-renderer": {
      "types":   "./types/fabric-renderer.d.ts",
      "import":  "./dist/fabric-renderer/fabric-renderer.common.js",
      "require": "./dist/fabric-renderer/fabric-renderer.common.js",
      "default": "./dist/fabric-renderer/fabric-renderer.common.js"
    },
    "./fabric-renderer/style": "./dist/fabric-renderer/fabric-renderer.css",
    "./package.json": "./package.json"
  },
  // TS < 4.7（不识别 exports 的 types 条件）按子路径回退解析
  "typesVersions": { "*": { "fabric-renderer": ["types/fabric-renderer.d.ts"] } },
  "dependencies":     { /* 仅真正打进 bundle 的：axios / colord / vue-router */ },
  "peerDependencies": { /* 见下节 2.2 */ }
}
```

### 字段含义

- **`main` / `module`**：主库入口。当前产物是 CJS（`.common.js`，webpack4 产物），故两者指向同一文件。无真正 ESM，现代栈也无法 tree-shaking（见 §8 演进）。
- **`types`**：主入口类型声明 `types/index.d.ts`（手写，覆盖组件 Props / 事件 / `api` / adapters / extensions）。
- **`publishConfig.registry`**：把发布目标固定为 **npm 官方源**。本机 `.npmrc` 的默认 `registry` 是淘宝镜像
  （只读、无法发布），有这行后 `npm publish` 无需再手动带 `--registry`，也不会误发到镜像。
- **`style`**：主库样式入口（部分工具/loader 自动识别）。
- **`files`**：npm 发布时**仅打包**这些路径，且**逐个指向两个 lib 子目录**而非整个 `dist`
  （`npm run build` 的应用站点产物落在 `dist/` 根：`index.html`、`js/`、`css/`、`fonts/`、`favicon.ico`、根级 svg 等，**不属于交付物**）：
  `dist/vue-fabric-editor`、`dist/fabric-renderer` 为两个 lib 产物；`types` 为类型声明；`fabric-renderer.js` 是 webpack4 子路径兜底 stub（见 §4.3）。
  发布前用 `npm pack --dry-run` 复核；正常结果约 **29 个文件 / 1.4MB**（`dist/*/demo.html` 仅有数百字节，随包发布不影响消费）。
- **`exports`**：现代解析器（Node 12+ / webpack5 / Vite）据此映射子路径，每个入口带 `types` 条件（TS 4.7+ 会优先命中）。CSS 用 `./style` / `./fabric-renderer/style`；额外导出 `./package.json`，避免被 `exports` 屏蔽。
- **`typesVersions`**：TS < 4.7 不识别 `exports` 内的 `types` 条件，用它对 `fabric-renderer` 子路径做声明回退。
- **`sideEffects`**：声明 CSS/Less/**`.vue`** 有副作用，避免打包器误删样式或抑制摇树。**必须包含 `**/*.vue`**：SFC `<style>` 在 vue-loader 下是 `.vue?vue&type=style…` 虚拟模块，资源路径是 `.vue`；若只声明 `**/*.css`/`**/*.less`，生产模式 tree-shaking 会把 SFC 样式整块删除，导致 `fabric-renderer.css` 不产出、`vue-fabric-editor.css` 丢失组件样式。
- **`prepublishOnly`**：`npm publish` 前自动执行两个 lib 构建，防止 `dist` 过期/缺失（`dist` 被 gitignore，不会随 git 走）。

### 2.2 peerDependencies（两栈一致）

产物把运行时依赖全部 external（`svg-path-editor-lib` 除外——1.0.4 起为纯函数库已打包进产物，
放 `dependencies`），外部项目（无论 webpack4 还是现代栈）都需自行提供。
peer 列表**与产物真实 `require` 一一对应（16 个）**：

`vue`、`@vue/composition-api`、`view-design`、`fabric`、`lodash-es`、`number-precision`、
`events`、`tapable`、`uuid`、`hotkeys-js`、`jsbarcode`、`qr-code-styling`、`fontfaceobserver`、
`vue-i18n`、`vue-cropper`、`@webtoon/psd`（完整清单见 [package.json](./package.json) `peerDependencies`）。

> 只用 `fabric-renderer` 的项目只需其中 9 个：`vue`、`@vue/composition-api`、`fabric`、`events`、
> `tapable`、`uuid`、`fontfaceobserver`、`jsbarcode`、`qr-code-styling`。

> 以下包**不在 peer 列表**（消费方无需安装）：
> - `qs` / `dayjs` / `vue-lazyload` / `vue-masonry`：仅本仓库演示站点与示例使用 → 已放入 `devDependencies`；
> - `vue-clipboard2`：源码中已无引用，直接移除；
> - `core-js`：产物不 `require` 它（polyfill 注入由业务侧 babel preset-env 决定），
>   列为 peer 会与业务侧钉死的版本（如 `3.6.5`）产生 npm ERESOLVE 冲突（externals 中的死配置也已清理）。

---

## 3. 目录放置建议

**推荐：本仓库作为独立目录 / 独立 git 仓库，放在业务仓库之外。** 例如与业务仓库平级：

```
<workspace>/
├── vue-fabric-editor/            # 本仓库（vue-fabric-editor）独立维护
└── business-app/  # 业务项目
```

### 为什么放外部
- **解耦与独立发版**：vue-fabric-editor 是独立版本库，可独立打 tag / 发版；业务仓库只需锁定对 vue-fabric-editor 的引用。
- **避免污染**：外部业务用 `file:` symlink 引用，vue-fabric-editor 的源码与 `dist` 产物不进入业务仓库。
- **多业务复用**：多个业务项目可同时引用同一 vue-fabric-editor，一处升级多处生效。

### 放内部的代价（不推荐）
若放进业务仓库内（如 `business-app/packages/vue-fabric-editor`），引用路径更短，但耦合高：vue-fabric-editor 会随业务仓库一起受版本控制、部署、构建影响，且多业务无法共享同一份独立演进。

### 两种引用形态
- **本地协作（未发布 npm）**：业务项目 `file:` 相对路径引用（见 §4）。
- **已发布 npm**：业务项目直接 `npm i @chenyican/vue-fabric-editor@x.y.z`，无需关心 vue-fabric-editor 目录物理位置。

---

## 4. 使用方式

### 4.1 安装与完整流程

#### 方式 A：本地 `file:` 引用（未发布）

业务项目消费的是**本机磁盘上 vue-fabric-editor 仓库构建出的 `dist` 产物**，所以必须先构建、再安装，且源码每次变更后都要重新构建。

**第 1 步：在 vue-fabric-editor 仓库构建（首次 & 每次源码变更后）**

```bash
cd ../vue-fabric-editor
npm run build:lib            # 主库 → dist/vue-fabric-editor/
npm run build:lib:renderer   # 渲染包 → dist/fabric-renderer/
```

**第 2 步：业务项目声明依赖并安装**

```jsonc
// 业务项目 package.json
"dependencies": {
  "@chenyican/vue-fabric-editor": "file:../vue-fabric-editor"   // key 必须与包名一致；路径按实际目录调整
}
```
```bash
npm install
```

**第 3 步：按 §4.2 / §4.3 在业务项目中引入 JS 与 CSS。**

⚠️ 注意事项：
- `file:` 会创建指向 vue-fabric-editor 目录的 **symlink**，业务项目实时使用的就是该目录当前的 `dist`。
- **改了编辑器源码必须重跑第 1 步**，否则业务项目一直用旧产物（symlink 不会自动触发重新构建）。
- 已 symlink 的情况下，仅重新构建后**无需重装**，业务项目下次构建即可拿到新产物；若 `node_modules` 异常再删除重装。
- npm 6（vue-cli 4 常见配套）**不会自动安装 peerDependencies**，业务项目须自行安装 §2.2 清单中的依赖。

#### 方式 B：已发布 npm / 私有 registry

tarball 在发布时已包含构建好的 `dist` 产物，业务项目**无需任何本地构建**：

```bash
npm install @chenyican/vue-fabric-editor@1.0.0                                    # 公共 npm
npm install @chenyican/vue-fabric-editor@1.0.0 --registry http://localhost:4873   # 私有 registry
```

- npm 7+ 自动安装 peerDependencies；npm 6 或版本冲突时用 `npm i --legacy-peer-deps` 或自行安装 peers。
- 构建发生在发布侧：发布前须完成两个 lib 构建（见 §6.1 检查清单），业务项目只消费发布好的版本。

### 4.2 现代栈（webpack5 / Vite / Node 12+）—— 走 `exports`

```js
import VueFabricEditor, { Editor, WorkspacePlugin } from '@chenyican/vue-fabric-editor';
import '@chenyican/vue-fabric-editor/style';

import { RendererCore } from '@chenyican/vue-fabric-editor/fabric-renderer';
import '@chenyican/vue-fabric-editor/fabric-renderer/style';
```
- 根包默认导出为 Vue 2 插件（`Vue.use(FabricEditor)`）或可直接渲染的 `FabricEditor` 组件。
- 命名导出含全部引擎/插件/纯函数/hooks（主库经 `export * from '@/core'` 再导出，具名导出约 90 个；渲染器具名导出约 25 个，含 `RendererCore` 与 `FabricRenderer` 渲染组件）。
- CSS 通过 `exports` 子路径映射。

### 4.3 webpack4（Vue2 + vue-cli 4）——走 `main` / stub / 完整相对路径

webpack4 **不识别 `exports` 子路径**，需按经典解析规则 + 显式 CSS 路径：

```js
import VueFabricEditor, { Editor, WorkspacePlugin } from '@chenyican/vue-fabric-editor';
import '@chenyican/vue-fabric-editor/dist/vue-fabric-editor/vue-fabric-editor.css';

import { RendererCore } from '@chenyican/vue-fabric-editor/fabric-renderer';
import '@chenyican/vue-fabric-editor/dist/fabric-renderer/fabric-renderer.css';
```
- 根包 JS：webpack4 读 `main` → 命中 `dist/vue-fabric-editor/vue-fabric-editor.common.js`。
- 子路径 `fabric-renderer`：webpack4 经典解析 → 命中仓库根级 `fabric-renderer.js` stub（`module.exports = require('./dist/fabric-renderer/fabric-renderer.common.js')`），该 stub 已加入 `files` 随包发布。
- CSS：不识别 `./style`，直接用 `dist` 内完整相对路径。

### 4.4 两种栈用法对照速查

| 能力 | 现代栈 | webpack4 |
| --- | --- | --- |
| 根包 JS | `import { Editor } from '@chenyican/vue-fabric-editor'` | 相同 |
| 主库 CSS | `import '@chenyican/vue-fabric-editor/style'` | `import '@chenyican/vue-fabric-editor/dist/vue-fabric-editor/vue-fabric-editor.css'` |
| 渲染器 JS | `import { RendererCore } from '@chenyican/vue-fabric-editor/fabric-renderer'` | 相同（走 stub） |
| 渲染器 CSS | `import '@chenyican/vue-fabric-editor/fabric-renderer/style'` | `import '@chenyican/vue-fabric-editor/dist/fabric-renderer/fabric-renderer.css'` |

### 4.5 画布素材：已内联（1.0.4+），消费方零配置

> **1.0.3 及以前**：13 个画布素材（5 个控件图标 svg + 8 张滤镜缩略图 png）经 JS 侧 file-loader 引用，
> URL 在 lib 构建期烘焙 + 运行时 `setPublicPath` 改写，宿主必须挂 `VfeAssetsPlugin` 或配
> `assetsBaseUrl`，否则控制条图标 404 → `drawImage InvalidStateError`。
> **该契约在 1.0.4 起废除**，本节只保留迁移说明与实现原理。

#### 现状（1.0.4+）

| 素材 | 引用方式 | 宿主需要做什么 |
| --- | --- | --- |
| 5 个控件图标（`middlecontrol` / `middlecontrolhoz` / `edgecontrol` / `rotateicon` / `lock`） | `!!raw-loader!` 导入源码 → `svgDataUri()` 转为 data URI，直接赋给 `img.src` 供 `ctx.drawImage` | **什么都不用做**（data URI 无外部请求） |
| 8 张滤镜缩略图（`Filters.vue` 面板） | 组件内以 CSS 类（`.filter-thumb--<Name>`）经相对 `url()` 引用；lib 构建产出带 hash 的 `img/*.png` | **什么都不用做**：宿主 import 本包 CSS 时，宿主 css-loader 会重新解析相对 url，用宿主 file-loader 重新产出并按宿主 publicPath 重写 |

因此 `loader/`（assets-loader / webpack-plugin）、`installRuntime({ assetsBaseUrl })`、
`setCanvasAssetsBaseUrl` / `resolveCanvasAsset` 导出均已移除。升级到 1.0.4 的消费方请：

1. 删除 `vue.config.js` 里的 `VfeAssetsPlugin` 配置（不删会报 `Cannot find module '.../loader/webpack-plugin.js'`，这是预期的显性提示）；
2. 删除 `installRuntime` 调用里的 `assetsBaseUrl` 选项（传入会被静默忽略，仅为兼容保留）。

#### 为什么 CSS 引用不需要特殊处理（原理）

JS 侧的 `file-loader` URL 在 **lib 构建期烘焙成字符串**，运行时宿主无法再干预；
而 CSS 里的相对 `url()` 在宿主 `import` 该 CSS 时会**被宿主的 css-loader 重新解析**——
node_modules 内的图片文件经宿主 file-loader 重新产出、URL 按宿主 publicPath 重写。
所以「把引用挪进 CSS」= 把资源的处理权交还宿主构建链，这正是本方案零配置的原因。

前提：宿主通过打包管线 import CSS（vue-cli / webpack / Vite 默认行为）；直接 `<link>` 引
node_modules 内 CSS 而不经打包的场景不受支持。

#### 遗留排查（仅针对升级未清理的宿主）

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 构建报 `Cannot find module '.../loader/webpack-plugin.js'` | 宿主仍挂着已移除的 `VfeAssetsPlugin` | 删除该 plugin 配置 |
| 滤镜缩略图 404（`url(img/xxx.png)`） | 宿主 CSS 管线未处理包内 CSS（如直接 `<link>` 引 node_modules 文件） | 改为经打包器 import CSS；或把 `dist/vue-fabric-editor/img/` 与 CSS 部署到同目录 |

### 4.6 运行时单实例注入接口（推荐接入方式）

**背景**：本包与消费方各自依赖 `vue` / `@vue/composition-api`。当依赖树出现**第二份副本**（npm 未 hoist、
版本区间不匹配导致嵌套安装、monorepo 多版本等）时会出现两个难以定位的崩溃：

| 多副本 | 症状 |
| --- | --- |
| `@vue/composition-api` | 两份模块实例 → composition-api 的 `window.Vue.use(Plugin)` 自安装执行两次 → 注入两个全局 mixin → `The setup binding property "..." is already declared` |
| `vue` | vue-i18n 的全局 mixin 装在副本 Vue 上 → 本项目组件拿不到 `$t` → `_vm.$t is not a function` |

传统解法是让消费方在构建配置里写 `resolve.alias` 收敛副本——但那是**构建期隐性契约**：
换打包器（Vite/Rspack）即失效，且出问题时难以自查。

**本包提供运行时接口，把契约变成一次显式调用（跨打包器通用、无需任何构建配置）**：

```js
// 消费方入口 main.js（建议紧跟 Vue.use(VueCompositionAPI) 之后）
import Vue from 'vue';
import VueCompositionAPI from '@vue/composition-api';
import { installRuntime } from '@chenyican/vue-fabric-editor'; // 渲染器：@chenyican/vue-fabric-editor/fabric-renderer

Vue.use(VueCompositionAPI);
installRuntime({ vue: Vue, compositionApi: VueCompositionAPI });
```

行为约定：

1. **注入后**：包内（编辑器 + 渲染器）所有 `vue` / `@vue/composition-api` 的使用都返回注入实例，
   依赖树里再多副本也不会被用到——多副本彻底无害。
2. **幂等**：重复调用安全；`installRuntime` 会顺带在注入的 Vue 上幂等 `Vue.use(compositionApi)`，
   不再依赖 composition-api 的 `window.Vue` 自安装。
3. **未注入时**：回退为「构建器解析到的那份」（与历史行为完全一致，接入方式向后兼容）；
   开发环境首次回退会打印一条提示，便于发现问题。
4. **时序**：包内所有 API 包装均为**调用期取值**，因此注入即使发生在包被 import 之后同样生效；
   仅 `Vue.use(VueI18n)` 这类模块加载期注册会在注入后**补注册一次**（幂等）。
5. **可选自检**：`isRuntimeInjected()` 可判断是否已注入，便于消费方在启动日志中确认。

> **接入建议**：优先使用本接口；**不再需要在构建配置里写 `vue` / `@vue/composition-api` 的 alias**。
> 若项目因历史原因保留了 alias，与注入并存也无冲突（注入优先）。

---

## 5. 本地 `file:` 与 npm 发布的差异

| 维度 | `file:` 本地依赖 | npm 发布 |
| --- | --- | --- |
| 安装来源 | 相对路径 symlink | `npm i @chenyican/vue-fabric-editor@版本` |
| 需要网络 | 否 | 是（或私有 registry） |
| 打包范围 | **symlink 整个 vue-fabric-editor 目录**（忽略 `files`） | **仅打包 `files` 列出的路径** |
| `private: true` | 不影响 | **阻断 `npm publish`** |
| webpack4 子路径 stub | 随整个目录在，天然可用 | 需把 `fabric-renderer.js` 加进 `files`（已配置） |
| peerDeps 安装 | **不自动装**，业务项目须自己装 | npm 7+ **自动装** peers |
| 版本管理 | 无版本号，指向当前目录 | 需维护 `version`，可打 tag / 锁定 | 
| 多机协作 | 每台机器都要有 vue-fabric-editor 目录 + 已构建的 dist | registry 分发，无需本地副本 |
| CSS / 资源 | 相对路径解析（symlink 目录内） | 随包发布，路径解析一致 |

### 主要坑点
1. **`file:` 看的是整个目录**：即使 `files` 只列了 `dist`，本地也会带全部源码进 node_modules（symlink，不占双份磁盘）。发布版才受 `files` 约束。
2. **`private: true` 会直接拒绝 `npm publish`**：发布前必须 `private: false`。
3. **同时跑两个 lib 构建会互相清空产物**：必须用 `--dest` 分目录（已配置），且发布前两者都要执行。

---

## 6. 发布流程（npm）

> 前提：本仓库放在独立目录；`dist` 产物已存在于磁盘（`dist` 被 gitignore，不随 git，但发布时直接从磁盘打包）。

### 6.1 发布前检查清单

按序执行（前四步是质量闸门，后三步是产物闸门）：

```bash
npm run lint && npm test        # 0 error / 0 warning；30 suites / 382 tests
npm run typecheck               # types/*.d.ts 消费侧冒烟（tests/types/usage.ts）
npm run test:layer              # 可选：layer.vue 拖拽排序脚本（JSDOM，独立于 jest）
npm run build                   # 应用站点（demo）构建，确认页面未被改坏
npm run build:lib               # → dist/vue-fabric-editor/
npm run build:lib:renderer      # → dist/fabric-renderer/
npm pack --dry-run              # 确认 tarball：dist/ 两个子目录 + types/ + fabric-renderer.js，无 src/tests
```

字段检查：

- [ ] `private` 为 `false`（或删除该字段）
- [ ] `version` 已更新到目标版本（`npm version patch/minor/major`，同时打 git tag）
- [ ] `files` 为 `dist/vue-fabric-editor`、`dist/fabric-renderer`、`types`、`fabric-renderer.js`（**不要**写成整个 `dist`，否则应用站点产物会被打包）
- [ ] `types/index.d.ts` 与 `types/fabric-renderer.d.ts` 与当前源码 API 一致
- [ ] `repository` / `homepage` / `bugs` 指向真实仓库地址（npm 页面与 issue 入口依赖它）

> `prepublishOnly` 会在 `npm publish` 前自动重跑两个 lib 构建；若用 `npm publish --ignore-scripts`，必须手动先构建。

### 6.2 发布命令

> **推荐**：对外发版走 §6.6 的 **CI 自动发布（Trusted Publishing / OIDC）**，无需 token 与 OTP。
> 下面两种为本机手动发布，作为备选/应急（本机 npm CLI 为 8.x，2027-01 后 bypass-2FA token 将不能再直接发布）。

**公共 npm：**
```bash
npm publish
```

**私有 registry（如 verdaccio）：**
```bash
npm publish --registry http://localhost:4873
# 或写入 .npmrc：
#   registry=http://localhost:4873
```

### 6.3 发布后业务项目使用
```bash
npm install @chenyican/vue-fabric-editor@1.0.0
```
peerDeps 由 npm 7+ 自动安装；若与业务自身依赖版本冲突，用 `npm i --legacy-peer-deps` 或调整版本。

### 6.4 多机 / 团队协作建议
- 单机开发：用 `file:` 即可，最快。
- 团队协作未发 npm：私有 registry（verdaccio）发版本，`npm i @chenyican/vue-fabric-editor@x` 统一拉取，避免每台机器都要 vue-fabric-editor 本地副本与 dist。
- 正式对外：公共 npm 发布 + 版本号 + tag。

### 6.5 发布后验证（消费侧）

在空目录里真实安装一次，确认 `main` / `exports` / `types` 与 peerDependencies 都能被消费：

```bash
mkdir /tmp/fe-check && cd /tmp/fe-check && npm init -y
npm i @chenyican/vue-fabric-editor vue@2 fabric view-design @vue/composition-api

# 1) JS 入口解析（webpack5/Vite 走 exports，webpack4 走 main）
node -e "console.log(Object.keys(require('@chenyican/vue-fabric-editor')).length, 'exports')"

# 2) 类型声明是否随包带出
npm view @chenyican/vue-fabric-editor types   # 期望：types/index.d.ts
echo "import { FabricEditor } from '@chenyican/vue-fabric-editor'; void FabricEditor;" > check.ts
npx tsc --noEmit --skipLibCheck --esModuleInterop --moduleResolution node check.ts
```

第 1 步报 `Cannot find module` → 查 `files` 是否漏了产物；第 2 步报找不到声明 → 查 `types` 字段与 `exports["."].types`。

### 6.6 CI 自动发布（Trusted Publishing / OIDC，推荐）

本机环境固定在 Node 16（npm 8），**不支持** Trusted Publishing（要求 npm CLI ≥ 11.5.1 / Node ≥ 22.14），
且 2027-01 起 bypass-2FA 的 granular token 将失去直接发布权限。
因此对外发版走 GitHub Actions：**构建用 Node 16、发布用 Node 24 走 OIDC**，无需任何 token 与 OTP，本机无需升级。

#### 一次性配置（npm 侧）

前提：包已存在（首次发布已完成）；仓库为 public（public repo + public 包才会自动生成 provenance）；
`package.json` 的 `repository.url` 必须与 GitHub 仓库一致。

**Packages → 本包 → Settings → Trusted publishing → GitHub Actions**：

| 字段 | 值 |
| --- | --- |
| Organization or user | `zhiqinyigu` |
| Repository | `vue-fabric-editor` |
| Workflow filename | `publish.yml`（**只填文件名**、含扩展名，文件必须位于 `.github/workflows/`） |
| Environment name | 留空 |
| Allowed actions | **勾选允许 `npm publish`**（2026-09-03 之后新建的配置默认只允许 `npm stage publish`） |

> ⚠️ 该配置**保存后不可编辑**，填错需删除重建；npm **不在保存时校验**，错误只在发布时报出。
> 每个包最多 10 个 trusted publisher。

#### 工作流（仓库侧）

`.github/workflows/publish.yml`，`v*` tag 触发，两步走：

1. **Node 16.14.0** → `npm install`（无 lockfile，不能用 `npm ci`）→ `npm run build:lib` + `build:lib:renderer`；
2. **Node 24**（自带 npm ≥ 11.5.1）→ `npm publish --ignore-scripts`：
   `registry-url` 指向官方源；`--ignore-scripts` 跳过 `prepublishOnly`（dist 已就绪，避免在 Node 24 上重跑 webpack4 构建）；
   `--provenance` 无需显式添加。

#### 发版流程

```bash
npm version patch          # 改版本 + 打 tag（附注标签）
git push --follow-tags     # 触发 publish.yml → 构建 + OIDC 发布
```

#### 发布成功后再收紧权限（官方建议顺序）

1. 先用上述流程成功发布一个版本；
2. 包 **Settings → Publishing access** 勾选 **"Require two-factor authentication and disallow tokens"**（**不影响** OIDC）；
3. 到 **Access Tokens** 吊销不再需要的 bypass-2FA granular token。

#### 排错

| 现象 | 原因 |
| --- | --- |
| `ENEEDAUTH` / `Unable to authenticate` | workflow 文件名与 npm 上配置不一致（逐字符含扩展名）；或漏了 `id-token: write`；或使用了自建 runner（不支持） |
| `You do not have permission to publish` | 配置里未勾选允许 `npm publish` → 改用 `npm stage publish` + 人工审批 |
| CI 中 `npm whoami` 显示未登录 | 正常：OIDC 只在 publish/stage 那一刻生效 |
| 没有 provenance 证明 | 私有仓库不生成；public repo + public 包才有 |

---

## 7. 构建命令速查

```bash
npm run build               # 应用构建（demo/内部站点，非对外交付）
npm run build:lib           # 主库 → dist/vue-fabric-editor/
npm run build:lib:renderer  # 渲染包 → dist/fabric-renderer/
npm pack --dry-run          # 预览发布 tarball 内容（发布前必查）
npx jest                    # 全量单测
npm run typecheck           # 校验 types/*.d.ts（消费侧冒烟用例 tests/types/usage.ts）
git push --follow-tags      # 推送 tag → 触发 CI 自动发布（见 §6.6）
```

---

## 8. 已知限制与后续演进

- **产物为 CJS / UMD，非真正 ESM**：由 webpack4（vue-cli）构建，现代栈虽能通过 `exports` 使用，但**无法 tree-shaking**，编辑器包较大（min 约 550KB）。若外部多为 Vite / TS 项目，建议后续迁移构建链至 **Vite / Rollup library mode** 产出 ESM，并靠 `exports` 的 `import`/`require` 条件分发表述。
- **类型声明为手写**：`types/index.d.ts` 与 `types/fabric-renderer.d.ts` 覆盖组件 Props / 事件 / 命令式 `api` / adapters / extensions 与主要具名导出；引擎与插件的深层内部类型保持 `any`。**源码 API 变更后需同步更新这两个文件**（暂未接入 `tsc` / `vue-tsc` 自动生成，`npm run lint` 不会校验它们）；待 ESM 化时可改为自动生成。
- **webpack4 的 CSS 无法走子路径**：只能用完整相对路径（见 §4.3）。
- **peer 依赖较多（16 个，已与产物 `require` 对齐）**：externals 覆盖的包统一放在 `peerDependencies`；`dependencies` 保留真正打进 bundle 的 `axios` / `colord` / `svg-path-editor-lib`（1.0.4 起打包进产物并经 babel 转译为 ES5，消费方 webpack4 无需再转译）与演示站点用的 `vue-router`；仅演示站点/示例用到的 `qs` / `dayjs` / `vue-lazyload` / `vue-masonry` 放在 `devDependencies`，消费方无需安装。npm 7+ 会自动安装 peers，npm 6 需业务侧自行安装（见 §2.2）。
- **画布素材已内联（1.0.4+，消费方零配置）**：5 个控件图标在 JS 内联为 data URI（约 +8KB）；
  8 张滤镜缩略图经 CSS 相对 `url()` 引用、由宿主 CSS 管线产出（`img/*.png`，约 430KB，随宿主部署按需加载，
  不占 JS bundle）。原 `VfeAssetsPlugin` / `assetsBaseUrl` 契约已废除（见 §4.5 迁移说明）。
  **演进方向（未实施）**：压缩这 8 张缩略图——当前显示宽度仅约 120px，却按 47~59KB/张发布；
  改为「显示宽度 ×2 的 WebP（q≈78）」预计可降到 25~60KB（合计），或将缩略图改为
  **运行时用 fabric 滤镜生成 + 缓存**，可把素材降到近乎 0。

---

## 附：常见问题（FAQ）

**Q1：`import '@chenyican/vue-fabric-editor/fabric-renderer'` 报 `Cannot find module`？**
- 若在现代栈：确认 npm/构建器版本支持 `exports`（Node 12+ / webpack5 / Vite）。
- 若在 webpack4：确认该包**已发布**（stub 在 `files` 内）或本地 `file:` 方式（整个目录在，stub 天然存在）；且 `dist/fabric-renderer/` 产物已构建。

**Q2：业务项目引 CSS 找不到？**
现代栈用 `@chenyican/vue-fabric-editor/style`、`@chenyican/vue-fabric-editor/fabric-renderer/style`；webpack4 用 §4.3 的完整 dist 相对路径。

**Q3：为什么 `file:` 装了但 `Editor` 是 undefined？**
确认为 CJS 产物，确认使用解构/默认导入方式与 §4 一致；也不要试图在纯 Node 环境 require（会因 fabric 依赖 canvas 原生模块加载失败，**目标环境是浏览器构建**）。

**Q4：构建顺序/产物被覆盖？**
两个 lib 构建必须各自 `--dest`（已配置）。发布前先后执行两者，`dist/` 内两个子目录应都在。

**Q5：升级 1.0.4 后构建报 `Cannot find module '.../loader/webpack-plugin.js'`？**
1.0.4 起画布素材已内联，`VfeAssetsPlugin` / assets-loader 已随包移除（见 §4.5）。
删除消费项目 vue.config.js 里的 `VfeAssetsPlugin` 配置即可。
