# 第三方代码与资源声明

本仓库是 [ikuaitu/vue-fabric-editor](https://github.com/ikuaitu/vue-fabric-editor) 的 **Vue 2 移植与二次开发版本**，
下面列出本项目包含的上游及第三方代码/资源的来源与许可，以遵守各自的署名要求。

## 上游项目

| 项目 | 来源 | 许可 |
| --- | --- | --- |
| vue-fabric-editor（快图设计） | https://github.com/ikuaitu/vue-fabric-editor | MIT License |

说明：

- 本仓库沿用 MIT 协议（见 [LICENSE](./LICENSE)），并保留上游版权声明。
- `src/` 下大量文件保留了上游作者的文件头注释（如 `@Author: 秦少卫`），这是 MIT 要求的署名凭据，**请勿批量删除**。
- 上游 README 中的致谢同样沿用：标尺功能作者 刘明野；渐变组件 palxiao。

## 内嵌/衍生的第三方代码

| 组件/文件 | 来源 | 许可 |
| --- | --- | --- |
| `src/components/color-picker/index.css` | [tailwindcss](https://tailwindcss.com) v3.3.2 构建产物（文件头已保留其版权行） | MIT License |
| `src/components/color-picker/` 取色器组件 | 上游项目内的取色器实现 | MIT License |
| `src/core/plugin/RulerPlugin.js` | 上游项目（作者 刘明野） | MIT License |
| `src/components/vue-color-palette-vue2/` | [jinghaihan/vue-color-palette](https://github.com/jinghaihan/vue-color-palette)（Vue 3 → Vue 2、TS → JS 移植内嵌，目录内附其 LICENSE 原文） | MIT License（Copyright (c) 2025 Jing Haihan） |

## 运行时依赖

运行时依赖（`package.json` 的 `dependencies`）均为开源包，许可以其各自仓库为准，主要包括：
`fabric`（MIT）、`vue`（MIT）、`view-design`（MIT）、`vue-i18n`（MIT）、`lodash-es`（MIT）、
`dayjs`（MIT）、`jsbarcode`（MIT）、`qr-code-styling`（MIT）、`@webtoon/psd`（MIT）等。

## 字体

本仓库**不内置任何字体文件**。原上游内置的商业中文字体（华康金刚黑、汉体）已移除，
因为商业字库通常不允许随开源仓库自由分发。

如需内置字体，请自行选择可自由分发的字体（如思源黑体、霞鹜文楷等 SIL OFL / Apache-2.0 授权字体），
放入 `src/assets/fonts/cn/` 并在 `src/assets/fonts/font.css` 中声明 `@font-face`。
