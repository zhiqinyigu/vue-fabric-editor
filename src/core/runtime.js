/*
 * 运行时单实例门面（runtime facade）
 *
 * ## 解决什么问题
 *
 * 本包与消费方各自依赖 `vue`、`@vue/composition-api`。若依赖树里出现**第二份副本**
 * （npm 未 hoist、版本区间不匹配导致嵌套安装、monorepo 多版本等），会出现难以定位的崩溃：
 *
 * - 两份 `@vue/composition-api`：composition-api 的 dist 检测到 `window.Vue` 存在会自动
 *   `window.Vue.use(Plugin)`；两份模块实例 → 绕过 Vue 的 `_installedPlugins` 去重 → 注入两个
 *   全局 mixin → 所有 `setup()` 组件被双重绑定，报
 *   `The setup binding property "xxx" is already declared`。
 * - 两份 `vue`：vue-i18n 的全局 mixin 装在副本 Vue 上，本项目组件拿不到 `$t`，
 *   报 `_vm.$t is not a function`。
 *
 * 传统做法是让消费方在构建配置里写 `resolve.alias` 把两者收敛到同一份——那是一条
 * **隐性构建期契约**（换打包器失效、且出问题时难以自查）。
 *
 * 本门面把契约变成**一次显式运行时调用**（跨打包器通用，无需任何构建配置）：
 *
 * ```js
 * // 消费方入口 main.js（务必在 import 编辑器组件之前调用）
 * import Vue from 'vue';
 * import VueCompositionAPI from '@vue/composition-api';
 * import { installRuntime } from '@chenyican/vue-fabric-editor';
 *
 * installRuntime({ vue: Vue, compositionApi: VueCompositionAPI });
 * ```
 *
 * 注入后，库内**所有**对 `vue` / `@vue/composition-api` 的使用都改走本门面，
 * 一律返回消费方注入的那一份实例；即便依赖树里还存在其它副本也不会被用到。
 *
 * ## 未注入时的行为
 *
 * 回退到「构建器解析到的那份」（与注入前完全一致），不会破坏既有接入方式；
 * 开发环境下首次回退会打印一次提示（见 `warnFallbackOnce`），把隐性风险显性化。
 *
 * ## 构建期如何让库内代码走本门面
 *
 * 由 `vue.config.js` 在 **lib 构建**中把 `@vue/composition-api` 精确 alias 到本文件
 * （`'@vue/composition-api$'`），因此源码里原有的
 * `import { ref } from '@vue/composition-api'` 无需改动即可命中门面。
 * 门面自身用**深层路径**懒加载真实包并声明为 external，避免与 alias 自引用冲突。
 * `vue` 不 alias（默认导出形态无法安全代理），仅在库内确实需要 Vue 单例的少数位置
 * （如 `src/lib/i18n.js`）显式使用 `getVue()`。
 */

import { setCanvasAssetsBaseUrl } from './canvasAsset';

// 注入的实例（消费方提供）
let injectedVue = null;
let injectedCompositionApi = null;
let runtimeReady = false;
const readyCallbacks = [];

// 回退实例（懒加载，避免「已注入」场景下仍然加载并触发副本的自安装副作用）
let fallbackVueCache;
let fallbackApiCache;
let warnedFallbackVue = false;
let warnedFallbackApi = false;

function warnFallbackOnce(what) {
  if (process.env.NODE_ENV === 'production') return;
  if (what === 'vue' && warnedFallbackVue) return;
  if (what === 'api' && warnedFallbackApi) return;
  if (what === 'vue') warnedFallbackVue = true;
  else warnedFallbackApi = true;
  // eslint-disable-next-line no-console
  console.info(
    `[vfe] 未检测到 installRuntime 注入，${what === 'vue' ? 'vue' : '@vue/composition-api'} ` +
      '使用构建解析到的实例。若依赖树存在多份副本，可能出现 ' +
      '"_vm.$t is not a function" 或 "setup binding property ... is already declared"，' +
      '请在消费方入口调用 installRuntime({ vue, compositionApi })（见 PACKAGING.md）。'
  );
}

/**
 * 注入消费方的单例实例（幂等，可重复调用）
 *
 * 除 `vue` / `compositionApi` 外，还支持 `assetsBaseUrl`：非 webpack 打包器下
 * 指定画布素材基址（详见 src/core/canvasAsset.js 与 PACKAGING.md §4.5）。
 *
 * @param {{ vue?: Object, Vue?: Object, compositionApi?: Object, CompositionApi?: Object, assetsBaseUrl?: string|Function }} options
 * @returns {boolean} 是否至少生效了一项
 */
export function installRuntime(options = {}) {
  const vue = options.vue || options.Vue;
  const compositionApi = options.compositionApi || options.CompositionApi || options.api;
  const assetsBaseUrl = options.assetsBaseUrl || options.canvasAssetsBaseUrl;
  if (vue) injectedVue = vue;
  if (compositionApi) injectedCompositionApi = compositionApi;
  if (assetsBaseUrl) setCanvasAssetsBaseUrl(assetsBaseUrl);
  if (!vue && !compositionApi && !assetsBaseUrl) return false;

  // 把注入的 composition-api 装到注入的 Vue 上：显式且幂等，不依赖其 window.Vue 自安装
  if (injectedVue && injectedCompositionApi && typeof injectedVue.use === 'function') {
    injectedVue.use(injectedCompositionApi);
  }

  runtimeReady = true;
  const callbacks = readyCallbacks.splice(0, readyCallbacks.length);
  callbacks.forEach((cb) => {
    try {
      cb(injectedVue);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[vfe] onRuntimeReady 回调执行失败', e);
    }
  });
  return true;
}

/** 是否已注入（任一即视为已注入） */
export function isRuntimeInjected() {
  return !!(injectedVue || injectedCompositionApi);
}

/**
 * 互操作兜底：`require()` 一个 ESM 形态的模块时可能拿到 `{ default: 真实导出 }`。
 * 仅在对象自身缺少预期成员、而 default 上有时才解包，避免误伤 CJS 形态（vue2 的
 * dist/vue.runtime.common.js 就是 CJS，`require('vue')` 直接是构造函数）。
 */
function unwrapDefault(mod, probe) {
  if (!mod) return mod;
  if (typeof mod[probe] !== 'undefined') return mod;
  if (mod.default && typeof mod.default[probe] !== 'undefined') return mod.default;
  return mod;
}

/** 获取 Vue 单例：优先注入，其次构建解析到的实例 */
export function getVue() {
  if (injectedVue) return injectedVue;
  if (!fallbackVueCache) {
    warnFallbackOnce('vue');
    // 懒加载：externals 场景下为运行期 require，未调用则不会加载
    // eslint-disable-next-line global-require
    fallbackVueCache = unwrapDefault(require('vue'), 'use');
  }
  return fallbackVueCache;
}

/** 获取 composition-api 单例：优先注入，其次构建解析到的实例 */
export function getCompositionApi() {
  if (injectedCompositionApi) return injectedCompositionApi;
  if (!fallbackApiCache) {
    warnFallbackOnce('api');
    // 深层路径：避开库构建里 '@vue/composition-api$' 的精确 alias（否则自引用）
    // 该请求在 lib 构建中被声明为 external → 消费方解析到自己的副本
    // eslint-disable-next-line global-require
    fallbackApiCache = unwrapDefault(
      require('@vue/composition-api/dist/vue-composition-api.common.js'),
      'ref'
    );
  }
  return fallbackApiCache;
}

/**
 * 注册「运行时就绪」回调：已注入则立即执行，否则排队等待注入。
 * 用于库内需要在消费方 Vue 上做全局注册的少数场景（如 `Vue.use(VueI18n)`）。
 */
export function onRuntimeReady(callback) {
  if (runtimeReady) {
    callback(injectedVue);
    return;
  }
  readyCallbacks.push(callback);
}

/* ------------------------------------------------------------------ *
 * composition-api API 包装
 *
 * 调用期取值（而非模块加载期解构），保证注入发生在 import 之后也能命中注入实例。
 * 覆盖库内实际使用的全部 API；后续新增使用需在此补充。
 * ------------------------------------------------------------------ */
export function computed(...args) {
  return getCompositionApi().computed(...args);
}
export function defineComponent(...args) {
  return getCompositionApi().defineComponent(...args);
}
export function getCurrentInstance(...args) {
  return getCompositionApi().getCurrentInstance(...args);
}
export function inject(...args) {
  return getCompositionApi().inject(...args);
}
export function nextTick(...args) {
  return getCompositionApi().nextTick(...args);
}
export function onBeforeMount(...args) {
  return getCompositionApi().onBeforeMount(...args);
}
export function onBeforeUnmount(...args) {
  return getCompositionApi().onBeforeUnmount(...args);
}
export function onDeactivated(...args) {
  return getCompositionApi().onDeactivated(...args);
}
export function onMounted(...args) {
  return getCompositionApi().onMounted(...args);
}
export function onUnmounted(...args) {
  return getCompositionApi().onUnmounted(...args);
}
export function provide(...args) {
  return getCompositionApi().provide(...args);
}
export function reactive(...args) {
  return getCompositionApi().reactive(...args);
}
export function ref(...args) {
  return getCompositionApi().ref(...args);
}
export function toRaw(...args) {
  return getCompositionApi().toRaw(...args);
}
export function toRefs(...args) {
  return getCompositionApi().toRefs(...args);
}
export function unref(...args) {
  return getCompositionApi().unref(...args);
}
export function watch(...args) {
  return getCompositionApi().watch(...args);
}
/* 常用但当前未使用的 API：一并包装，避免后续新增使用时报「未导出」 */
export function watchEffect(...args) {
  return getCompositionApi().watchEffect(...args);
}
export function onErrorCaptured(...args) {
  return getCompositionApi().onErrorCaptured(...args);
}
export function isRef(...args) {
  return getCompositionApi().isRef(...args);
}
export function markRaw(...args) {
  return getCompositionApi().markRaw(...args);
}
export function set(...args) {
  return getCompositionApi().set(...args);
}
export function del(...args) {
  return getCompositionApi().del(...args);
}

export default {
  installRuntime,
  isRuntimeInjected,
  getVue,
  getCompositionApi,
  onRuntimeReady,
};
