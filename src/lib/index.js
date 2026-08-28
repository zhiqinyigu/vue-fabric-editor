/*
 * @Author: cyc
 * @Date: 2026-08-20 10:15:11
 * @LastEditors: cyc
 * @LastEditTime: 2026-08-20 10:15:11
 * vue-fabric-editor 包入口（单入口：Vue 外壳 + 引擎）
 */
import FabricEditor from './FabricEditor.vue';

// 引擎与插件
export { default as Editor } from '@/core';
export * from '@/core';

// 注册表 / 扩展 / API
export { createRegistry, createAdapterRegistry, createUiRegistry } from './registry';
export { createExtensionManager } from './extensionManager';
export { createEditorApi } from './api';

// 上下文与 hooks
export { provideEditorContext, useEditorContext, EditorContextKey } from '@/hooks/useEditorContext';
export { default as useSelect } from '@/hooks/select';
export { default as useSelectListen } from '@/hooks/useSelectListen';
export { default as useCalculate } from '@/hooks/useCalculate';
export { default as useTestData } from '@/hooks/useTestData';
export { default as useI18n } from '@/hooks/useI18n';

// i18n
export { createI18n, messages } from './i18n';

// 运行时单实例注入：消费方入口调用一次即可（跨打包器通用，无需构建期 alias）。
// 详见 PACKAGING.md「运行时单实例注入接口」。
export { installRuntime, isRuntimeInjected } from '@/core/runtime';

// 画布素材基址（非 webpack 打包器场景；webpack 项目请使用 VfeAssetsPlugin）。
// 详见 PACKAGING.md §4.5「画布素材资源与宿主接入契约」。
export { setCanvasAssetsBaseUrl, resolveCanvasAsset } from '@/core/canvasAsset';

// 内置可覆盖组件（UI 注册表 key）
export { default as TopbarImport } from './components/TopbarImport.vue';
export { default as RightPanel } from '@/views/home/components/right/index.vue';

const plugin = {
  install(Vue, options = {}) {
    // 可选：全局注册 FabricEditor 组件
    Vue.component(options.componentName || 'FabricEditor', FabricEditor);
  },
};

export default Object.assign(FabricEditor, { install: plugin.install });

export { FabricEditor };
