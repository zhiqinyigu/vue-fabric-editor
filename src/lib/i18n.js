/*
 * @Author: cyc
 * @Date: 2026-08-20 10:15:11
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-01 10:27:16
 * 包内 i18n
 * - 导出 messages 供业务合并进自己的 vue-i18n
 * - 导出 createI18n 让业务可直接拿到带包内文案的实例
 * - 编辑器上下文内的 t 走该实例，扩展组件用 useEditorContext().t 即可翻译
 */
import VueI18n from 'vue-i18n';
import { getVue, onRuntimeReady } from '@/core/runtime';
import zhView from 'view-design/dist/locale/zh-CN';
import enView from 'view-design/dist/locale/en-US';
import zh from '@/language/zh.json';
import en from '@/language/en.json';
import pt from '@/language/pt.json';

// VueI18n 的全局注册走 runtime 门面，确保装在消费方的唯一 Vue 实例上：
// - 立即执行一次：未注入时用构建解析到的 Vue（与历史行为一致）
// - 再注册「注入后」回调：消费方 installRuntime 若晚于本模块加载，补注册一次
//   （Vue.use 对同一实例幂等，重复调用安全）
const installVueI18n = (vue) => {
  if (vue && typeof vue.use === 'function') vue.use(VueI18n);
};
installVueI18n(getVue());
onRuntimeReady(installVueI18n);

export const messages = {
  en: Object.assign({}, en, enView),
  zh: Object.assign({}, zh, zhView),
  pt,
};

function getDefaultLocale() {
  let lang = 'zh';
  try {
    lang = (navigator.language || 'zh').split('-')[0];
  } catch (e) {
    lang = 'zh';
  }
  return messages[lang] ? lang : 'zh';
}

function mergeMessages(extra = {}) {
  const merged = {};
  Object.keys(messages).forEach((k) => {
    merged[k] = Object.assign({}, messages[k], extra[k] || {});
  });
  return merged;
}

export function createI18n(options = {}) {
  return new VueI18n({
    locale: options.locale || getDefaultLocale(),
    fallbackLocale: options.fallbackLocale || 'zh',
    messages: mergeMessages(options.messages),
  });
}

export default createI18n;
