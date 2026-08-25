/*
 * @Author: cyc
 * @Date: 2026-08-25 16:34:40
 * @LastEditors: cyc
 * @LastEditTime: 2026-08-25 16:34:40
 * vue-router@3 的 useRouter/useRoute 兼容层（等价 vue-router@4 的 composition API）
 */
import { getCurrentInstance } from '@vue/composition-api';

export function useRouter() {
  const instance = getCurrentInstance();
  const vm = instance && (instance.proxy || instance.root);
  return vm ? vm.$router : null;
}

export function useRoute() {
  const instance = getCurrentInstance();
  const vm = instance && (instance.proxy || instance.root);
  return vm ? vm.$route : null;
}
