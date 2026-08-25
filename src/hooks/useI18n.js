/*
 * @Author: cyc
 * @Date: 2026-08-25 16:34:40
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-01 10:27:16
 * vue-i18n@8 的 useI18n 兼容层（等价 vue-i18n@9 的 useI18n）
 * Vue2.6 + @vue/composition-api 环境下，通过实例上的 $t 提供翻译能力
 */
import { getCurrentInstance } from '@vue/composition-api';

export function useI18n() {
  const instance = getCurrentInstance();
  return {
    t: (key, ...args) => {
      const vm = instance && (instance.proxy || instance.root);
      if (!vm || typeof vm.$t !== 'function') return key;
      return vm.$t(key, ...args);
    },
  };
}

export default useI18n;
