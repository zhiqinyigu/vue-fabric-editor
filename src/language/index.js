/*
 * @Author: June
 * @Description:
 * @Date: 2023-10-29 12:18:14
 * @LastEditors: June
 * @LastEditTime: 2023-11-01 12:01:24
 */
import VueI18n from 'vue-i18n';
import { getVue, onRuntimeReady } from '@/core/runtime';
import zh from 'view-design/dist/locale/zh-CN';
import en from 'view-design/dist/locale/en-US';
import US from './en.json';
import CN from './zh.json';
import PT from './pt.json';
import { getLocal, setLocal } from '@/utils/local';
import { LANG } from '@/config/constants/app';

// 本模块同时被应用站点（main.js）与库内核心（core/plugin）引用，VueI18n 的全局注册
// 走 runtime 门面：保证装在消费方的唯一 Vue 实例上（未注入时回退为构建解析到的 Vue）。
// Vue.use 对同一实例幂等，重复调用安全。
const installVueI18n = (vue) => {
  if (vue && typeof vue.use === 'function') vue.use(VueI18n);
};
installVueI18n(getVue());
onRuntimeReady(installVueI18n);

const messages = {
  en: Object.assign(US, en), // 将自己的英文包和iview提供的结合
  zh: Object.assign(CN, zh), // 将自己的中文包和iview提供的结合
  pt: PT,
};

function getLocalLang() {
  let localLang = getLocal(LANG);
  if (!localLang) {
    let defaultLang = navigator.language;
    if (defaultLang) {
      defaultLang = defaultLang.split('-')[0];
      localLang = defaultLang;
    }
    setLocal(LANG, defaultLang);
  }
  return localLang;
}
const lang = getLocalLang();

const i18n = new VueI18n({
  locale: lang,
  fallbackLocale: 'zh',
  messages,
});

export default i18n;
export const t = (key) => {
  return i18n.t(key);
};
