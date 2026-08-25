/*
 * @Author: June
 * @Description:
 * @Date: 2023-10-29 12:18:14
 * @LastEditors: June
 * @LastEditTime: 2023-11-01 12:01:24
 */
import Vue from 'vue';
import VueI18n from 'vue-i18n';
import zh from 'view-design/dist/locale/zh-CN';
import en from 'view-design/dist/locale/en-US';
import US from './en.json';
import CN from './zh.json';
import PT from './pt.json';
import { getLocal, setLocal } from '@/utils/local';
import { LANG } from '@/config/constants/app';

Vue.use(VueI18n);

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
