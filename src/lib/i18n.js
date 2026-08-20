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
import Vue from 'vue';
import VueI18n from 'vue-i18n';
import zhView from 'view-design/dist/locale/zh-CN';
import enView from 'view-design/dist/locale/en-US';
import zh from '@/language/zh.json';
import en from '@/language/en.json';
import pt from '@/language/pt.json';

Vue.use(VueI18n);

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