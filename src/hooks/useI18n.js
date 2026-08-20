/*
 * @Author: cyc
 * @Date: 2026-08-25 16:34:40
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-01 10:27:16
 * 翻译 hook
 * 优先使用编辑器上下文注入的 t（扩展组件场景）；
 * 回退到实例 $t（业务已接入 vue-i18n 时）；
 * 都没有时返回 key 本身。
 */
import { getCurrentInstance } from '@vue/composition-api';
import { useEditorContext } from './useEditorContext';

export function useI18n() {
  const instance = getCurrentInstance();
  const ctx = instance ? useEditorContext() : null;

  return {
    t: (key, ...args) => {
      if (ctx && ctx.t && typeof ctx.t === 'function') {
        const val = ctx.t(key, ...args);
        if (val !== undefined && val !== key) return val;
      }
      const vm = instance && (instance.proxy || instance.root);
      if (vm && typeof vm.$t === 'function') return vm.$t(key, ...args);
      return key;
    },
  };
}

export default useI18n;